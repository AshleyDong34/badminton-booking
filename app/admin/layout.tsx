export default function AdminLayout({ children }: { children: React.ReactNode }) {
return (
<div className="min-h-screen grid md:grid-cols-[220px_1fr]">
<aside className="border-r p-4 md:block hidden">
<div className="text-xl font-semibold mb-4">Admin</div>
<nav className="space-y-2">
<a className="block" href="/admin">Dashboard</a>
<a className="block" href="/admin/sessions">Sessions</a>
<a className="block" href="/admin/settings">Settings</a>
<a className="block" href="/admin/admins">Admins</a>
</nav>
</aside>
<main className="p-4 md:p-8">{children}</main>
</div>
);
}