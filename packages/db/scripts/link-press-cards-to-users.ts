// Links v1 JSON-seeded PressCard rows (userId null) to the User with the
// exact same name. Prints what it could not match; those get linked by an
// admin from the Users → Press ID card dialog (an unlinked card with the
// same name is offered there). Safe to run on every deploy.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const cards = await prisma.pressCard.findMany({ where: { userId: null }, select: { id: true, cardNo: true, name: true } });
  let linked = 0;
  for (const c of cards) {
    const users = await prisma.user.findMany({ where: { name: c.name, active: true }, select: { id: true } });
    if (users.length === 1) { await prisma.pressCard.update({ where: { id: c.id }, data: { userId: users[0].id } }); linked++; console.log(`linked ${c.cardNo} -> ${users[0].id}`); }
    else console.log(`UNMATCHED ${c.cardNo} "${c.name}" (${users.length} candidates)`);
  }
  console.log(`press cards linked: ${linked}, still unlinked: ${cards.length - linked}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
