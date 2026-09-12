"use client";

/**
 * Which Business Profile listing this client is.
 *
 * Loaded on demand rather than on page render, because it costs two
 * Google calls and the answer barely changes. Once chosen it is stored
 * on the client, so the scheduled sync — which has no page to carry a
 * selection — knows which listing to pull.
 */

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { chooseLocation, listLocationChoices, type LocationChoices } from "./actions";

export function LocationPicker({
  clientId,
  selected,
}: {
  clientId: number;
  selected: string | null;
}) {
  const [choices, setChoices] = useState<LocationChoices | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(selected);

  const load = async () => {
    setBusy(true);
    setChoices(await listLocationChoices(clientId));
    setBusy(false);
  };

  return (
    <section className="glass-apple rounded-2xl px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-3.5" />
            Which listing
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {current ?? "Not chosen yet. Reviews cannot be pulled until it is."}
          </p>
        </div>
        <button
          onClick={load}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-40"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          {current ? "Change" : "Find my listings"}
        </button>
      </div>

      {choices && !choices.ok && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {choices.error}
          {choices.scopeMissing && (
            <>
              {" "}
              Reconnect Google in Settings and grant the Business Profile
              permission. Reviews cannot be read or answered without it.
            </>
          )}
        </p>
      )}

      {choices?.ok && (
        <ul className="mt-3 space-y-1.5">
          {choices.locations.length === 0 && (
            <li className="text-xs text-muted-foreground">
              The connected Google account manages no listings.
            </li>
          )}
          {choices.locations.map((loc) => (
            <li key={loc.name}>
              <button
                onClick={async () => {
                  setBusy(true);
                  const res = await chooseLocation(clientId, loc.name);
                  if (res.ok) {
                    setCurrent(loc.name);
                    setChoices(null);
                  }
                  setBusy(false);
                }}
                className={`w-full rounded-lg px-3 py-2 text-left text-xs ring-1 ring-inset transition-colors ${
                  current === loc.name
                    ? "bg-cyan-500/15 text-cyan-100 ring-cyan-500/30"
                    : "bg-white/[0.03] ring-white/10 hover:bg-white/[0.07]"
                }`}
              >
                <span className="font-medium">{loc.title || loc.name}</span>
                {loc.storefrontAddress && (
                  <span className="ml-2 text-muted-foreground">
                    {[
                      ...(loc.storefrontAddress.addressLines ?? []),
                      loc.storefrontAddress.locality,
                      loc.storefrontAddress.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
