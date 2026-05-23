import CancelBookingClient from "./CancelBookingClient";

type CancelPageProps = {
  searchParams?: Promise<{
    token?: string | string[];
  }>;
};

export default async function CancelPage({ searchParams }: CancelPageProps) {
  const params = await searchParams;
  const tokenParam = params?.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] ?? "" : tokenParam ?? "";

  return <CancelBookingClient token={token} />;
}

