export const analyticsPaths = {
  '/analytics/dashboard': {
    get: {
      tags: ['Analytics'],
      summary: 'Get dashboard statistics',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Dashboard stats' } },
    },
  },
  '/analytics/assignments': {
    get: {
      tags: ['Analytics'],
      summary: 'Get assignment analytics',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Assignment analytics' } },
    },
  },
  '/analytics/quizzes': {
    get: {
      tags: ['Analytics'],
      summary: 'Get quiz analytics',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Quiz analytics' } },
    },
  },
  '/analytics/students': {
    get: {
      tags: ['Analytics'],
      summary: 'Get student performance analytics',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'studentId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Student performance' } },
    },
  },
  '/analytics/teachers': {
    get: {
      tags: ['Analytics'],
      summary: 'Get teacher performance analytics',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Teacher performance' } },
    },
  },
  '/analytics/usage': {
    get: {
      tags: ['Analytics'],
      summary: 'Get API and resource usage stats',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Usage stats' } },
    },
  },
  '/analytics/ai-usage': {
    get: {
      tags: ['Analytics'],
      summary: 'Get AI endpoint usage stats',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'AI usage stats' } },
    },
  },
};
