import NewSessionForm from "./NewSessionForm";

export default function NewSessionPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Create session</h1>
      <NewSessionForm />
    </div>
  );
}
