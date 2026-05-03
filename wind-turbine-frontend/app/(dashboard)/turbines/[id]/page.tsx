import { redirect } from 'next/navigation';

export default function TurbineDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/turbines/${params.id}/overview`);
}
