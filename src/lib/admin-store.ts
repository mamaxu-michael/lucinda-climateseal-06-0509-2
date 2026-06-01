import fs from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

export type ContactSubmission = {
  id: string;
  submittedAt: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  industry: string;
  message: string;
  referralCode?: string;
  referralOwnerId?: string;
  referralOwnerName?: string;
};

export type WhitepaperSubmission = {
  id: string;
  submittedAt: string;
  name: string;
  email: string;
  company: string;
  jobTitle: string;
  phone: string;
  whitepaperId: string;
  whitepaperTitle: string;
  instantDownloadAvailable: boolean;
  deliveryMode: 'download' | 'email' | 'manual';
};

export type UploadedAsset = {
  id: string;
  uploadedAt: string;
  filename: string;
  originalFilename: string;
  url: string;
  contentType: string;
  size: number;
};

export type ReferralOwner = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  role: 'expert' | 'consultant' | 'brand_manager' | 'procurement_manager' | 'other';
  company: string;
  referralCode: string;
  status: 'active' | 'inactive';
  notes?: string;
};

export type ReferralUse = {
  id: string;
  createdAt: string;
  referralCode: string;
  referralOwnerId: string;
  referralOwnerName: string;
  referredName: string;
  referredEmail: string;
  referredCompany: string;
  source: 'contact_form';
  contactSubmissionId: string;
  status: 'new' | 'qualified' | 'converted' | 'credited' | 'rejected';
  rewardValueUsd: number;
  notes?: string;
};

export type ConsultantPartnerApplication = {
  id: string;
  submittedAt: string;
  name: string;
  email: string;
  company: string;
  countryRegion: string;
  consultantType: 'carbon' | 'esg' | 'lca' | 'sustainability' | 'boutique_firm' | 'other';
  teamSize: string;
  clientIndustries: string[];
  projectTypes: string[];
  expectedProjectsNext3Months: string;
  wantsReferralAccess: boolean;
  website?: string;
  linkedin?: string;
  message?: string;
  status: 'new' | 'reviewing' | 'accepted' | 'rejected';
};

const ADMIN_DATA_DIR = path.join(process.cwd(), 'data', 'admin');
const CONTACTS_FILE = path.join(ADMIN_DATA_DIR, 'contact-submissions.json');
const WHITEPAPERS_FILE = path.join(ADMIN_DATA_DIR, 'whitepaper-submissions.json');
const ASSETS_FILE = path.join(ADMIN_DATA_DIR, 'uploaded-assets.json');
const REFERRAL_OWNERS_FILE = path.join(ADMIN_DATA_DIR, 'referral-owners.json');
const REFERRAL_USES_FILE = path.join(ADMIN_DATA_DIR, 'referral-uses.json');
const CONSULTANT_APPLICATIONS_FILE = path.join(ADMIN_DATA_DIR, 'consultant-partner-applications.json');
const DATABASE_URL = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

type ContactSubmissionRow = {
  id: string;
  submitted_at: string | Date;
  name: string;
  email: string;
  phone: string;
  company: string;
  industry: string;
  message: string;
  referral_code: string | null;
  referral_owner_id: string | null;
  referral_owner_name: string | null;
};

let dbClient: ReturnType<typeof neon> | null = null;
let contactSubmissionsTableReady = false;

function getDbClient() {
  if (!DATABASE_URL) {
    return null;
  }

  dbClient ??= neon(DATABASE_URL);
  return dbClient;
}

async function ensureContactSubmissionsTable() {
  const sql = getDbClient();
  if (!sql || contactSubmissionsTableReady) {
    return Boolean(sql);
  }

  await sql`
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id TEXT PRIMARY KEY,
      submitted_at TIMESTAMPTZ NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      company TEXT NOT NULL,
      industry TEXT NOT NULL,
      message TEXT NOT NULL,
      referral_code TEXT,
      referral_owner_id TEXT,
      referral_owner_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  contactSubmissionsTableReady = true;
  return true;
}

function mapContactSubmissionRow(row: ContactSubmissionRow): ContactSubmission {
  return {
    id: row.id,
    submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : new Date(row.submitted_at).toISOString(),
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    industry: row.industry,
    message: row.message,
    referralCode: row.referral_code ?? undefined,
    referralOwnerId: row.referral_owner_id ?? undefined,
    referralOwnerName: row.referral_owner_name ?? undefined,
  };
}

async function ensureAdminDir() {
  await fs.mkdir(ADMIN_DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string): Promise<T[]> {
  await ensureAdminDir();

  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeJsonFile<T>(filePath: string, rows: T[]) {
  await ensureAdminDir();
  await fs.writeFile(filePath, JSON.stringify(rows, null, 2), 'utf8');
}

async function appendJsonRow<T>(filePath: string, row: T) {
  const rows = await readJsonFile<T>(filePath);
  rows.unshift(row);
  await writeJsonFile(filePath, rows);
}

export async function saveContactSubmission(submission: ContactSubmission) {
  const sql = getDbClient();
  if (sql) {
    await ensureContactSubmissionsTable();
    await sql`
      INSERT INTO contact_submissions (
        id,
        submitted_at,
        name,
        email,
        phone,
        company,
        industry,
        message,
        referral_code,
        referral_owner_id,
        referral_owner_name
      )
      VALUES (
        ${submission.id},
        ${submission.submittedAt},
        ${submission.name},
        ${submission.email},
        ${submission.phone},
        ${submission.company},
        ${submission.industry},
        ${submission.message},
        ${submission.referralCode ?? null},
        ${submission.referralOwnerId ?? null},
        ${submission.referralOwnerName ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        submitted_at = EXCLUDED.submitted_at,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        company = EXCLUDED.company,
        industry = EXCLUDED.industry,
        message = EXCLUDED.message,
        referral_code = EXCLUDED.referral_code,
        referral_owner_id = EXCLUDED.referral_owner_id,
        referral_owner_name = EXCLUDED.referral_owner_name
    `;
    return;
  }

  await appendJsonRow(CONTACTS_FILE, submission);
}

export async function saveWhitepaperSubmission(submission: WhitepaperSubmission) {
  await appendJsonRow(WHITEPAPERS_FILE, submission);
}

export async function saveUploadedAsset(asset: UploadedAsset) {
  await appendJsonRow(ASSETS_FILE, asset);
}

export async function listContactSubmissions(): Promise<ContactSubmission[]> {
  const sql = getDbClient();
  if (sql) {
    await ensureContactSubmissionsTable();
    const rows = await sql`
      SELECT
        id,
        submitted_at,
        name,
        email,
        phone,
        company,
        industry,
        message,
        referral_code,
        referral_owner_id,
        referral_owner_name
      FROM contact_submissions
      ORDER BY submitted_at DESC
    `;
    return (rows as ContactSubmissionRow[]).map(mapContactSubmissionRow);
  }

  return readJsonFile<ContactSubmission>(CONTACTS_FILE);
}

export async function listWhitepaperSubmissions(): Promise<WhitepaperSubmission[]> {
  return readJsonFile<WhitepaperSubmission>(WHITEPAPERS_FILE);
}

export async function listUploadedAssets(): Promise<UploadedAsset[]> {
  return readJsonFile<UploadedAsset>(ASSETS_FILE);
}

export async function saveReferralOwner(owner: ReferralOwner) {
  const owners = await readJsonFile<ReferralOwner>(REFERRAL_OWNERS_FILE);
  owners.unshift(owner);
  await writeJsonFile(REFERRAL_OWNERS_FILE, owners);
}

export async function listReferralOwners(): Promise<ReferralOwner[]> {
  return readJsonFile<ReferralOwner>(REFERRAL_OWNERS_FILE);
}

export async function findReferralOwnerByCode(referralCode: string): Promise<ReferralOwner | null> {
  const owners = await listReferralOwners();
  const normalized = referralCode.trim().toUpperCase();
  return owners.find((owner) => owner.referralCode.toUpperCase() === normalized && owner.status === 'active') ?? null;
}

export async function updateReferralOwner(
  ownerId: string,
  updates: Partial<Omit<ReferralOwner, 'id' | 'createdAt'>>
) {
  const owners = await listReferralOwners();
  const nextOwners = owners.map((owner) => (owner.id === ownerId ? { ...owner, ...updates } : owner));
  await writeJsonFile(REFERRAL_OWNERS_FILE, nextOwners);
}

export async function saveReferralUse(referralUse: ReferralUse) {
  await appendJsonRow(REFERRAL_USES_FILE, referralUse);
}

export async function listReferralUses(): Promise<ReferralUse[]> {
  return readJsonFile<ReferralUse>(REFERRAL_USES_FILE);
}

export async function updateReferralUse(
  referralUseId: string,
  updates: Partial<Omit<ReferralUse, 'id' | 'createdAt'>>
) {
  const uses = await listReferralUses();
  const nextUses = uses.map((use) => (use.id === referralUseId ? { ...use, ...updates } : use));
  await writeJsonFile(REFERRAL_USES_FILE, nextUses);
}

export async function saveConsultantPartnerApplication(application: ConsultantPartnerApplication) {
  await appendJsonRow(CONSULTANT_APPLICATIONS_FILE, application);
}

export async function listConsultantPartnerApplications(): Promise<ConsultantPartnerApplication[]> {
  return readJsonFile<ConsultantPartnerApplication>(CONSULTANT_APPLICATIONS_FILE);
}

export async function updateConsultantPartnerApplication(
  applicationId: string,
  updates: Partial<Omit<ConsultantPartnerApplication, 'id' | 'submittedAt'>>
) {
  const applications = await listConsultantPartnerApplications();
  const nextApplications = applications.map((application) =>
    application.id === applicationId ? { ...application, ...updates } : application
  );
  await writeJsonFile(CONSULTANT_APPLICATIONS_FILE, nextApplications);
}
