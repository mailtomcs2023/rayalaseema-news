import { Sidebar } from "@/components/sidebar";
import { CrudTable } from "@/components/crud-table";
import { prisma } from "@rayalaseema/db";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const data = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, _count: { select: { articles: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <CrudTable
          title="Users"
          apiPath="users"
          data={JSON.parse(JSON.stringify(data))}
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "role", label: "Role" },
            { key: "_count", label: "Articles", type: "count" },
            { key: "active", label: "Status", type: "boolean" },
          ]}
          fields={[
            { key: "name", label: "Name", type: "text", required: true },
            { key: "email", label: "Email", type: "text", required: true },
            { key: "password", label: "Password (required for new user; leave empty when editing to keep current)", type: "text" },
            { key: "role", label: "Role", type: "select", required: true, options: [
              { value: "ADMIN", label: "Admin" },
              { value: "EDITOR", label: "Editor" },
              { value: "SUB_EDITOR", label: "Sub Editor" },
              { value: "REPORTER", label: "Reporter" },
            ]},
            { key: "bio", label: "Bio", type: "textarea" },
            { key: "active", label: "Active", type: "checkbox", placeholder: "User is active" },
          ]}
        />
      </main>
    </div>
  );
}
