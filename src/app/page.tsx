import { loadPos, loadSchedule } from "@/lib/data";
import Dashboard from "./dashboard";

// Server component: reads the reference CSVs on the server and hands plain
// data to the client dashboard. No extra API endpoint needed.
export default function Home() {
  return <Dashboard pos={loadPos()} schedule={loadSchedule()} />;
}
