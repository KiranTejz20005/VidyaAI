import { api } from '@/lib/api';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  subject?: string;
}

export interface SubjectAttendanceStat {
  subject: string;
  percentage: number;
}

export interface AttendanceStats {
  totalClasses: number;
  presentClasses: number;
  percentage: number;
  diffFromLastMonth?: number;
  subjectAttendance: SubjectAttendanceStat[];
}

export interface StudentAttendanceResponse {
  records: AttendanceRecord[];
  stats: AttendanceStats;
}

export interface LeaveApplication {
  id: string;
  title: string;
  subject: string;
  status: string;
  createdAt: string;
  body?: string;
}

export interface LeaveApplicationInput {
  title: string;
  subject: string;
  body: string;
  duration: string;
}

/** Month is zero-based, matching the backend's `new Date(year, month, 1)` filter. */
export async function getStudentAttendance(month: number, year: number): Promise<StudentAttendanceResponse> {
  const res = await api.get(`/attendance/student`, { params: { month, year } });
  return res.data.data;
}

export async function listStudentLeaves(): Promise<LeaveApplication[]> {
  const res = await api.get('/attendance/student/leave');
  return res.data.data ?? [];
}

export async function submitStudentLeave(input: LeaveApplicationInput): Promise<void> {
  await api.post('/attendance/student/leave', input);
}
