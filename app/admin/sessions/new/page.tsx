import NewSessionForm from "./NewSessionForm";
import { supabaseServer } from "@/lib/supabase-server";

export default async function NewSessionPage() {
  const supabase = supabaseServer();
  const { data } = await supabase
    .from("settings")
    .select("allow_name_only")
    .eq("id", 1)
    .single();
  const defaultAllowNameOnly = Boolean(data?.allow_name_only);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Create session</h1>
        <p className="text-sm text-[var(--muted)]">
          Set the session time and capacity. Name is auto-generated if left blank.
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
        <NewSessionForm defaultAllowNameOnly={defaultAllowNameOnly} />
      </div>
    </div>
  );
}
