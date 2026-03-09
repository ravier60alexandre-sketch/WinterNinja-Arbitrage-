import { redirect } from 'next/navigation';

export default function BotsPage() {
  redirect('/overview?tab=bots');
}
