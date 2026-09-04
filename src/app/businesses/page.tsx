import Link from "next/link";
import { getServiceRoleClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

async function listBusinesses() {
  const supabase = getServiceRoleClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, name, business_type, default_language, is_demo")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export default async function BusinessesPage() {
  const businesses = await listBusinesses();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Businesses</h1>
        <Link href="/businesses/new">
          <Button>New business</Button>
        </Link>
      </div>

      {businesses.length === 0 ? (
        <div className="mt-6 border border-hairline bg-surface px-4 py-10 text-center">
          <p className="text-sm text-ink">No businesses yet</p>
          <p className="mt-1 text-sm text-muted">Create one to start configuring missed-call workflows.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-hairline border border-hairline bg-surface">
          {businesses.map((b) => (
            <li key={b.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-ink">{b.name}</p>
                <p className="text-xs text-muted">{b.business_type}</p>
              </div>
              {b.is_demo && <Badge tone="muted">Demo</Badge>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}