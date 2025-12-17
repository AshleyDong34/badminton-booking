// layout file means that every page under /admin is wraped with this component.
// so these functions are called when a route to admin/* is ever rendered.
// example of settings is tat 
export default function AdminLayout({ children }: { children: React.ReactNode }) {

  // children here is a property inside props, it is an children component of render thing. react node is anything that react can render. {} is used for destructioning in this case only.
  // two aside components, one for the links to the other routes under admin. the other is the children component of those links.
  // this splits the page in half depending on what is rendered. 
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