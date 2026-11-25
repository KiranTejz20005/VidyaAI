import prisma from '../config/prisma';
import { env } from '../config/env';
import OpenAI from 'openai';
import { getOrSet, CacheTTL } from '../api/common/cache';

let nvidiaClient: OpenAI | null = null;
function getNvidia(): OpenAI {
  if (!nvidiaClient) {
    nvidiaClient = new OpenAI({
      apiKey: env.NVIDIA_API_KEY || 'dummy-key',
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }
  return nvidiaClient;
}

/** Upper bound on rows loaded for in-memory aggregation. */
const MAX_AGGREGATION_ROWS = 5000;

export class AnalyticsService {
  /**
   * Performance of one student. `organizationId` confines the data to a tenant
   * and is part of the cache key, so cached results never cross tenants.
   * Callers must authorize access to `studentId` before calling.
   */
  static async getStudentPerformance(studentId: string, organizationId?: string) {
    return getOrSet(`analytics:student:${organizationId ?? 'platform'}:${studentId}`, async () => {
      return AnalyticsService.computeStudentPerformance(studentId, organizationId);
    }, CacheTTL.SHORT);
  }

  private static async computeStudentPerformance(studentId: string, organizationId?: string) {
    // Find submissions and evaluations
    const submissions = await prisma.studentSubmission.findMany({
      where: { studentId, ...(organizationId ? { organizationId } : {}) },
      include: {
        evaluations: true,
      },
      orderBy: { submittedAt: 'asc' },
      take: MAX_AGGREGATION_ROWS,
    });

    const scores = submissions
      .map(s => {
        const evaluation = s.evaluations[0];
        if (!evaluation) return null;
        return {
          assignmentId: s.assignmentId,
          score: evaluation.score,
          totalMarks: evaluation.totalMarks,
          percentage: (evaluation.score / evaluation.totalMarks) * 100,
          date: s.submittedAt,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const averageScore = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.percentage, 0) / scores.length
      : 0;

    // Compute topic mastery from RubricCriteria grades
    const topicScores: Record<string, { totalEarned: number; totalMax: number }> = {};
    
    submissions.forEach(s => {
      const evalObj = s.evaluations[0];
      if (evalObj && typeof evalObj.criteriaGrades === 'object' && Array.isArray(evalObj.criteriaGrades)) {
        const grades = evalObj.criteriaGrades as any[];
        grades.forEach(g => {
          const name = g.name || 'General';
          if (!topicScores[name]) {
            topicScores[name] = { totalEarned: 0, totalMax: 0 };
          }
          // If criteria has maxMarks, otherwise default to 10
          const max = g.maxMarks || 10;
          topicScores[name].totalEarned += g.score || 0;
          topicScores[name].totalMax += max;
        });
      }
    });

    const topicMastery = Object.entries(topicScores).map(([topic, data]) => ({
      topic,
      mastery: data.totalMax > 0 ? (data.totalEarned / data.totalMax) * 100 : 0,
    }));

    const weakAreas = topicMastery.filter(t => t.mastery < 65).map(t => t.topic);

    // Growth: comparison of last 2 scores vs first 2 scores
    let growthTrend = 'STABLE';
    if (scores.length >= 2) {
      const firstScore = scores[0].percentage;
      const lastScore = scores[scores.length - 1].percentage;
      if (lastScore > firstScore + 5) {
        growthTrend = 'UPWARD';
      } else if (lastScore < firstScore - 5) {
        growthTrend = 'DOWNWARD';
      }
    }

    // Get recommendations
    const recommendation = await prisma.aIRecommendation.findFirst({
      where: { studentId, type: 'STUDENT' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      studentId,
      averageScore,
      growthTrend,
      scoresHistory: scores,
      topicMastery,
      weakAreas,
      recommendation: recommendation?.content || null,
      suggestedTopics: recommendation?.suggestedTopics || [],
    };
  }

  /**
   * Performance of one class. With `organizationId` the class, its students and
   * their submissions are all confined to that tenant. Callers must authorize
   * access to the class before calling.
   */
  static async getGroupPerformance(groupId: string, organizationId?: string) {
    const students = await prisma.classStudent.findMany({
      where: { classId: groupId, ...(organizationId ? { class: { organizationId } } : {}) },
      take: MAX_AGGREGATION_ROWS,
    });

    // Submissions are keyed by user id, so roster rows are matched to users by e-mail.
    const studentEmails = students.map(s => s.email);
    const users = await prisma.user.findMany({
      where: { email: { in: studentEmails }, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, firstName: true, lastName: true },
    });
    const studentIds = users.map(u => u.id);

    // Find all submissions for these students
    const submissions = await prisma.studentSubmission.findMany({
      where: { studentId: { in: studentIds }, ...(organizationId ? { organizationId } : {}) },
      include: { evaluations: true },
      orderBy: { submittedAt: 'desc' },
      take: MAX_AGGREGATION_ROWS,
    });

    const evaluations = submissions
      .flatMap(s => s.evaluations)
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const averageScore = evaluations.length > 0
      ? (evaluations.reduce((sum, e) => sum + (e.score / e.totalMarks) * 100, 0) / evaluations.length)
      : 0;

    // Compute distribution
    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    evaluations.forEach(e => {
      const pct = (e.score / e.totalMarks) * 100;
      if (pct >= 90) distribution.A++;
      else if (pct >= 80) distribution.B++;
      else if (pct >= 70) distribution.C++;
      else if (pct >= 60) distribution.D++;
      else distribution.F++;
    });

    // Calculate top performers
    const studentScores: Record<string, { totalPct: number; count: number; name: string }> = {};
    users.forEach(u => {
      studentScores[u.id] = { totalPct: 0, count: 0, name: `${u.firstName} ${u.lastName}` };
    });

    submissions.forEach(sub => {
      const ev = sub.evaluations[0];
      if (ev && studentScores[sub.studentId]) {
        studentScores[sub.studentId].totalPct += (ev.score / ev.totalMarks) * 100;
        studentScores[sub.studentId].count++;
      }
    });

    const rankedStudents = Object.values(studentScores)
      .filter(s => s.count > 0)
      .map(s => ({
        name: s.name,
        avg: s.totalPct / s.count,
      }))
      .sort((a, b) => b.avg - a.avg);

    const recommendation = await prisma.aIRecommendation.findFirst({
      where: { groupId, type: 'CLASS' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      groupId,
      averageScore,
      distribution,
      topStudents: rankedStudents.slice(0, 5),
      weakPerformers: rankedStudents.slice(-3).reverse(),
      recommendation: recommendation?.content || null,
    };
  }

  static async generateAIRecommendations(targetId: string, type: 'STUDENT' | 'CLASS', organizationId?: string) {
    let promptText = '';
    let fallbackTopics: string[] = [];

    if (type === 'STUDENT') {
      const stats = await AnalyticsService.getStudentPerformance(targetId, organizationId);
      fallbackTopics = stats.weakAreas;
      promptText = `You are an expert educational tutor. Review the following student analytics performance:
  - Average score percentage: ${stats.averageScore.toFixed(1)}%
  - Performance trend: ${stats.growthTrend}
  - Topic mastery scores: ${JSON.stringify(stats.topicMastery)}
  - Weak areas: ${stats.weakAreas.join(', ') || 'None'}
  
  Provide a detailed structured markdown study plan and recommendation for this student. Output JSON containing:
  {
    "recommendations": "markdown study guide",
    "suggestedTopics": ["list", "of", "weak", "topics", "to", "review"]
  }`;
    } else {
      const stats = await AnalyticsService.getGroupPerformance(targetId, organizationId);
      promptText = `You are an expert curriculum supervisor. Review the following class-wide analytics performance:
  - Average score: ${stats.averageScore.toFixed(1)}%
  - Grade distribution: ${JSON.stringify(stats.distribution)}
  - Top performing students: ${JSON.stringify(stats.topStudents)}
  
  Provide a detailed structured markdown lesson review plan and group recommendations. Output JSON containing:
  {
    "recommendations": "markdown lesson guide",
    "suggestedTopics": ["list", "of", "topics", "needing", "re-teaching"]
  }`;
    }

    let finalContent = 'Please review key concepts and practice weak areas.';
    let suggested: string[] = [];

    try {
      const response = await getNvidia().chat.completions.create({
        model: 'meta/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: 'You are an educational AI analytics agent. Always return valid JSON only.' },
          { role: 'user', content: promptText },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      });

      const text = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(text.replace(/```json|```/gi, '').trim());
      finalContent = parsed.recommendations || finalContent;
      suggested = parsed.suggestedTopics || [];
    } catch {
      // Fallback recommendation built only from the measured weak areas.
      finalContent = `### Revision Plan
  Review topics where scores fall below 65%. Practice active recall and space repetition exercises.`;
      suggested = fallbackTopics;
    }

    // Save to DB
    const rec = await prisma.aIRecommendation.create({
      data: {
        studentId: type === 'STUDENT' ? targetId : null,
        groupId: type === 'CLASS' ? targetId : null,
        type,
        content: finalContent,
        suggestedTopics: suggested,
        organizationId: organizationId ?? null,
      },
    });

    return rec;
  }

  /**
   * Organization dashboard. Pass the caller's tenant; `undefined` aggregates
   * across the whole platform and must only be used for a SUPER_ADMIN.
   */
  static async getAdminAnalytics(organizationId?: string) {
    const totalUsers = await prisma.user.count({
      where: organizationId ? { organizationId } : {},
    });
    
    const totalTeachers = await prisma.user.count({
      where: organizationId ? { organizationId, role: 'TEACHER' } : { role: 'TEACHER' },
    });

    const totalStudents = await prisma.user.count({
      where: organizationId ? { organizationId, role: 'STUDENT' } : { role: 'STUDENT' },
    });

    const pendingInvites = await prisma.invitation.count({
      where: organizationId ? { organizationId, status: 'PENDING' } : { status: 'PENDING' },
    });

    const activeUsers = await prisma.session.count({
      where: {
        isActive: true,
        expiresAt: { gte: new Date() },
        ...(organizationId ? { user: { organizationId } } : {}),
      },
    });

    const papersGenerated = await prisma.generatedPaper.count({
      where: organizationId ? { organizationId } : {},
    });

    const assignmentsCreated = await prisma.assignment.count({
      where: organizationId ? { organizationId } : {},
    });

    // Token and cost usage aggregated per provider in the database.
    const promptExecs = await prisma.promptExecution.groupBy({
      by: ['providerName'],
      where: organizationId ? { organizationId } : {},
      _sum: { tokensPrompt: true, tokensCompletion: true, costUsd: true },
    });

    let totalTokens = 0;
    let totalCost = 0;
    const providerUsage: Record<string, { tokens: number; cost: number }> = {
      openai: { tokens: 0, cost: 0 },
      anthropic: { tokens: 0, cost: 0 },
      nvidia: { tokens: 0, cost: 0 },
      gemini: { tokens: 0, cost: 0 },
      groq: { tokens: 0, cost: 0 },
    };

    promptExecs.forEach(pe => {
      const tokens = (pe._sum.tokensPrompt ?? 0) + (pe._sum.tokensCompletion ?? 0);
      const cost = pe._sum.costUsd ?? 0;
      totalTokens += tokens;
      totalCost += cost;

      const provider = pe.providerName.toLowerCase();
      if (providerUsage[provider]) {
        providerUsage[provider].tokens += tokens;
        providerUsage[provider].cost += cost;
      }
    });

    // Dynamic department performance mocks
    const departments = await prisma.department.findMany({
      where: organizationId ? { organizationId } : {},
      select: { id: true, name: true },
    });

    // Real department performance: aggregate assignment counts and average scores
    const deptIds = departments.map(d => d.id);
    const facultyInDepts = await prisma.user.findMany({
      where: { departmentId: { in: deptIds }, role: 'TEACHER' },
      select: { id: true, departmentId: true }
    });
    const facultyToDept = new Map<string, string>();
    facultyInDepts.forEach(f => {
      if (f.departmentId) facultyToDept.set(f.id, f.departmentId);
    });

    const allAssignments = await prisma.assignment.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: { createdAt: 'desc' },
      take: MAX_AGGREGATION_ROWS,
      select: {
        createdById: true,
        submissions: {
          select: {
            createdAt: true,
            evaluations: { select: { score: true, totalMarks: true } },
          },
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    const deptStats: Record<string, { papers: number, totalScore: number, scoreCount: number }> = {};
    departments.forEach(d => deptStats[d.id] = { papers: 0, totalScore: 0, scoreCount: 0 });

    const recentActivityRaw = await prisma.assignment.findMany({
      where: {
        organizationId: organizationId ? organizationId : undefined,
        status: { in: ['PUBLISHED', 'REJECTED'] }
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { createdBy: { include: { department: true } } }
    });

    const recentActivity = recentActivityRaw.map(a => ({
      id: a.id,
      event: a.title,
      dept: a.createdBy?.department?.name || 'General',
      initiator: a.createdBy ? `${a.createdBy.firstName} ${a.createdBy.lastName}` : 'System',
      time: a.updatedAt.toISOString(),
      status: a.status
    }));

    const authorCounts: Record<string, { count: number, name: string }> = {};
    
    // Group logic for department performance and contributors
    allAssignments.forEach(a => {
      if (a.createdById) {
        // Contributors
        if (!authorCounts[a.createdById]) {
          authorCounts[a.createdById] = { count: 0, name: a.createdBy ? `${a.createdBy.firstName} ${a.createdBy.lastName}` : 'Unknown' };
        }
        authorCounts[a.createdById].count += 1;

        // Dept stats
        const dId = facultyToDept.get(a.createdById);
        if (dId && deptStats[dId]) {
          deptStats[dId].papers += 1;
        }
      }
      
      // Calculate submission scores for dept
      if (a.createdById) {
        const dId = facultyToDept.get(a.createdById);
        if (dId && deptStats[dId]) {
          a.submissions.forEach(sub => {
            if (sub.evaluations && sub.evaluations[0]) {
              const evalObj = sub.evaluations[0];
              const pct = (evalObj.score / (evalObj.totalMarks || 100)) * 100;
              deptStats[dId].totalScore += pct;
              deptStats[dId].scoreCount += 1;
            }
          });
        }
      }
    });

    const departmentPerformance = departments.map(d => {
      const stats = deptStats[d.id];
      return {
        departmentId: d.id,
        name: d.name,
        papersCount: stats.papers,
        averageScore: stats.scoreCount > 0 ? Math.round(stats.totalScore / stats.scoreCount) : 0
      };
    });

    // Chart Data (Real data over the last 6 months)
    const chartData = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

      const enrollments = await prisma.user.count({
        where: {
          role: 'STUDENT',
          createdAt: { gte: start, lte: end },
          organizationId: organizationId ? organizationId : undefined
        }
      });

      let completions = 0;
      allAssignments.forEach(a => {
        a.submissions.forEach(sub => {
          if (new Date(sub.createdAt) >= start && new Date(sub.createdAt) <= end) {
             completions++;
          }
        });
      });

      chartData.push({
        month: start.toLocaleString('default', { month: 'short' }),
        Enrollment: enrollments,
        Completion: completions
      });
    }

    const paperApprovalsCount = await prisma.assignment.count({
      where: organizationId ? { organizationId, status: 'PUBLISHED' } : { status: 'PUBLISHED' },
    });

    let globalTotalScore = 0;
    let globalScoreCount = 0;
    Object.values(deptStats).forEach(s => {
      globalTotalScore += s.totalScore;
      globalScoreCount += s.scoreCount;
    });
    const avgAssessmentScore = globalScoreCount > 0 ? Math.round(globalTotalScore / globalScoreCount) : 0;

    const facultyEngagedCount = Object.keys(authorCounts).length;
    const facultyEngagement = totalTeachers > 0 ? Math.round((facultyEngagedCount / totalTeachers) * 100) : 0;

    const maxPapers = Math.max(...Object.values(authorCounts).map(a => a.count), 1);
    const topContributors = Object.entries(authorCounts)
      .map(([id, data]) => ({ id, name: data.name, count: data.count, score: Math.round((data.count / maxPapers) * 100) + '%' }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totals: {
        users: totalUsers,
        teachers: totalTeachers,
        students: totalStudents,
        pendingInvites: pendingInvites,
        activeUsers: activeUsers || 0, // removed fallback
        papersGenerated,
        assignmentsCreated,
        paperApprovals: paperApprovalsCount,
        avgAssessmentScore,
        facultyEngagement
      },
      aiAnalytics: {
        totalTokens,
        totalCost,
        providerUsage,
      },
      departmentPerformance,
      recentActivity,
      topContributors,
      chartData,
    };
  }
}
