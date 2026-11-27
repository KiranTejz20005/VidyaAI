import * as xlsx from 'xlsx';
import prisma from '../config/prisma';
import { logger } from '../utils/logger';
import { SystemRole } from '@prisma/client';
// processCsvImport — called by AdminController.importUsersCsv. Writes User rows.
// Phase 3: per-user temp passwords via hashPassword + generateTemporaryPassword.
import { resolveAssignableRole } from './admin/user.service';
import type { AdminActor } from './admin/admin-scope';
import * as argon2 from 'argon2';
import { generateTemporaryPassword } from '../security/credentials';

export interface CsvImportReport {
  created: number;
  skipped: number;
  duplicates: number;
  invalidEmails: number;
  errors: Array<{ row: number; email: string; error: string }>;
}

export const processCsvImport = async (filePath: string, organizationId: string, _createdById: string, actor: Pick<AdminActor, 'isSuperAdmin'>): Promise<CsvImportReport> => {
  const report: CsvImportReport = {
    created: 0,
    skipped: 0,
    duplicates: 0,
    invalidEmails: 0,
    errors: []
  };

  if (!organizationId) throw new Error('Organization scope required');

  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any>(sheet, { defval: '' });

    if (rows.length === 0) return report;

    // Pre-fetch existing emails
    const existingUsers = await prisma.user.findMany({ select: { email: true } });
    const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));

    const usersToCreate: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      const getVal = (keyMatch: string) => {
        const key = Object.keys(row).find(k => k.toLowerCase().includes(keyMatch.toLowerCase()));
        return key ? String(row[key]).trim() : '';
      };

      const email = getVal('email').toLowerCase();
      const roleStr = getVal('role');
      const firstName = getVal('first') || 'Imported';
      const lastName = getVal('last') || 'User';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        report.invalidEmails++;
        report.errors.push({ row: i + 2, email: email || 'missing', error: 'Invalid email format' });
        continue;
      }

      if (existingEmails.has(email)) {
        report.duplicates++;
        report.errors.push({ row: i + 2, email, error: 'User already exists' });
        continue;
      }
      
      // Same policy as invitations/user creation, but ADMIN is reserved for SUPER_ADMIN callers
      // and SUPER_ADMIN can never be minted through a bulk import.
      let role: SystemRole;
      try {
        role = resolveAssignableRole(actor, roleStr, { allowOrgAdmin: false });
        if (role === 'SUPER_ADMIN') throw new Error('SUPER_ADMIN cannot be assigned via CSV import');
      } catch (e: any) {
        report.skipped++;
        report.errors.push({ row: i + 2, email, error: `Invalid or disallowed role "${roleStr}": ${e.message}` });
        continue;
      }

      // Per-user temporary password (never a shared default like Welcome@123).
      const passwordHash = await argon2.hash(generateTemporaryPassword());
      usersToCreate.push({
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        organizationId,
        forcePasswordReset: true,
      });
      existingEmails.add(email); // Prevent duplicates within the same file
    }

    if (usersToCreate.length > 0) {
      // Chunking for performance
      const chunkSize = 1000;
      for (let i = 0; i < usersToCreate.length; i += chunkSize) {
        const chunk = usersToCreate.slice(i, i + chunkSize);
        
        await prisma.$transaction(async (tx) => {
          await tx.user.createMany({
            data: chunk,
            skipDuplicates: true
          });
          
          const createdUsers = await tx.user.findMany({
            where: { email: { in: chunk.map(u => u.email) } },
            select: { id: true, role: true }
          });
          
          const roles = await tx.role.findMany();
          const roleMap = new Map(roles.map(r => [r.name, r.id]));
          
          const userRoles = createdUsers.map(u => {
            const roleId = roleMap.get(u.role);
            if (roleId) {
              return { userId: u.id, roleId };
            }
            return null;
          }).filter(Boolean) as { userId: string, roleId: string }[];
          
          if (userRoles.length > 0) {
            await tx.userRole.createMany({
              data: userRoles,
              skipDuplicates: true
            });
          }
        });
        
        report.created += chunk.length;
      }
    }

    return report;
  } catch (error: any) {
    logger.error(`[CSV Import] Error processing file: ${error.message}`);
    throw error;
  }
};
