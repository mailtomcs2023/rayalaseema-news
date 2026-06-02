import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// PATCH /api/mandi/[id] - edit fields on an existing price row.
// Accepts any subset of { active, price, change } in the body. Used by the
// admin mandi page for:
//   - Eye-icon toggle (active flip → public site hide/show)
//   - Pencil-icon inline edit (price + change correction)
//   - Bulk Activate / Deactivate toolbar buttons (each row hits this in
//     parallel, mirroring how /review fans out bulk actions).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: { active?: boolean; price?: number; change?: number } = {};

    if (typeof body.active === "boolean") data.active = body.active;

    if (body.price !== undefined) {
      const p = Number(body.price);
      if (!Number.isFinite(p) || p <= 0) {
        return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
      }
      data.price = p;
    }

    if (body.change !== undefined) {
      const c = Number(body.change);
      if (!Number.isFinite(c)) {
        return NextResponse.json({ error: "Change must be a number" }, { status: 400 });
      }
      data.change = c;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }

    const updated = await prisma.mandiPrice.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE /api/mandi/[id] - permanent removal. Editors can deactivate (PATCH
// active: false) for hiding; only ADMINs can hard-delete a row.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.mandiPrice.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
