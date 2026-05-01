import { getDb } from '../db/kysely';

export interface ParentChildLinkRow {
  id: string;
  parent_user_id: string;
  child_user_id: string;
  relationship_type: string;
  status: string;
  consent_source: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function listChildrenForParent(parentUserId: string): Promise<ParentChildLinkRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('parent_child_links')
    .selectAll()
    .where('parent_user_id', '=', parentUserId)
    .where('status', '=', 'active')
    .orderBy('created_at', 'asc')
    .execute();
  return rows as unknown as ParentChildLinkRow[];
}

export async function listParentsForChild(childUserId: string): Promise<ParentChildLinkRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('parent_child_links')
    .selectAll()
    .where('child_user_id', '=', childUserId)
    .where('status', '=', 'active')
    .execute();
  return rows as unknown as ParentChildLinkRow[];
}

export async function findParentChildLink(
  parentUserId: string,
  childUserId: string
): Promise<ParentChildLinkRow | null> {
  const db = getDb();
  const row = await db
    .selectFrom('parent_child_links')
    .selectAll()
    .where('parent_user_id', '=', parentUserId)
    .where('child_user_id', '=', childUserId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  return (row as unknown as ParentChildLinkRow) ?? null;
}

export async function listChildrenWithDetails(
  parentUserId: string
): Promise<Array<{ id: string; name: string; display_name: string | null; primary_role: string; relationship_type: string }>> {
  const db = getDb();
  const rows = await db
    .selectFrom('parent_child_links as l')
    .innerJoin('users as u', 'u.id', 'l.child_user_id')
    .select(['l.child_user_id', 'u.display_name', 'u.external_subject', 'u.primary_role', 'l.relationship_type'])
    .where('l.parent_user_id', '=', parentUserId)
    .where('l.status', '=', 'active')
    .orderBy('u.display_name', 'asc')
    .execute();
  return (rows as any[]).map(r => ({
    id: r.child_user_id,
    name: (r.display_name?.trim() || null) ?? (/^\d+$/.test(String(r.external_subject ?? '')) ? null : String(r.external_subject).slice(0, 20)) ?? 'Child',
    display_name: r.display_name,
    primary_role: r.primary_role,
    relationship_type: r.relationship_type,
  }));
}
