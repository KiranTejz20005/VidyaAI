import { z } from 'zod';
import { passwordPolicySchema } from '../../security/credentials';

const email = z.string().trim().toLowerCase().email().max(254);

const strongPassword = passwordPolicySchema;

export const signupSchema = z.object({
  body: z.object({
    email,
    password: strongPassword,
    firstName: z.string().min(1).max(100).transform((s) => s.trim()),
    lastName: z.string().min(1).max(100).transform((s) => s.trim()),
    // Joining an existing organization requires an invitation (POST /auth/accept-invite);
    // self-service signups never receive tenant membership.
    role: z.enum(['STUDENT', 'TEACHER']).optional().default('TEACHER'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email,
    password: z.string().min(1, 'Password is required').max(128),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }),
});

export const acceptInviteSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required').max(256),
    password: strongPassword,
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: email.optional(),
    // Required to change the email address of a password account.
    currentPassword: z.string().max(128).optional(),
    avatar: z.string().max(500_000).nullable().optional(),
  }),
});

export const updatePreferencesSchema = z.object({
  body: z.object({
    preferences: z.record(z.unknown()),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    // Optional when the account is under forced reset (temp password / first login).
    currentPassword: z.string().min(1).max(128).optional(),
    newPassword: strongPassword,
  }),
});

export const switchOrganizationSchema = z.object({
  body: z.object({
    organizationId: z.string().uuid('Valid organization ID is required'),
  }),
});

export const sessionIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Valid session ID is required'),
  }),
});

export const googleSigninSchema = z.object({
  body: z
    .object({
      token: z.string().min(20).max(4096),
      /** Only used when creating a new account (`isSignUp: true`). Existing accounts use their stored role. */
      role: z.enum(['STUDENT', 'TEACHER', 'FACULTY', 'ADMIN', 'SUPER_ADMIN']).optional(),
      isSignUp: z.boolean().optional().default(false),
    })
    .superRefine((body, ctx) => {
      if (body.isSignUp && !body.role) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['role'],
          message: 'Role is required when signing up with Google',
        });
      }
    }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(32).max(256),
    newPassword: strongPassword,
  }),
});

export const updateOrganizationSchema = z.object({
  body: z.object({
    organizationName: z.string().trim().min(1).max(120).optional(),
    department: z.string().trim().min(1).max(120).optional(),
    academicYear: z.string().trim().max(20).optional(),
  }),
});
