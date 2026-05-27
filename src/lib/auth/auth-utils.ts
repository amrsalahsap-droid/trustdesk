import { getServerSession } from "./session";

export async function auth() {
  return getServerSession();
}
