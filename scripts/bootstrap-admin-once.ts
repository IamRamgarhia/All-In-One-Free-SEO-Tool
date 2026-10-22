import { registerUser } from "@/lib/auth";

const email = process.env.BOOTSTRAP_EMAIL ?? "";
const password = process.env.BOOTSTRAP_PASSWORD ?? "";
const name = process.env.BOOTSTRAP_NAME ?? "Admin";

if (!email || !password) {
  console.error("Set BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD.");
  process.exit(1);
}

registerUser({ email, password, name }).then((r) => {
  if (r.ok) {
    console.log(`Owner created: ${r.user.email} (id ${r.user.id})`);
    process.exit(0);
  }
  console.error(r.error);
  process.exit(1);
});
