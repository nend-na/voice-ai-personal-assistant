"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";

interface FormValues {
  ownerId: string;
  name: string;
  businessType: string;
  phoneNumber: string;
  defaultLanguage: "en" | "hi";
  timezone: string;
}

export default function NewBusinessPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      ownerId: "",
      name: "",
      businessType: "",
      phoneNumber: "",
      defaultLanguage: "en",
      timezone: "Asia/Kolkata",
    },
  });

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: data.ownerId,
          name: data.name,
          businessType: data.businessType,
          phoneNumber: data.phoneNumber || undefined,
          defaultLanguage: data.defaultLanguage,
          timezone: data.timezone,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = Array.isArray(body.details)
          ? body.details.map((d: any) => `${(d.path ?? []).join(".")}: ${d.message}`).join("; ")
          : body.error;
        throw new Error(detail || "creation_failed");
      }
      router.push("/workflows/new");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't create this business.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold text-ink">New business</h1>
      <p className="mt-1 text-sm text-muted">Create a business profile before setting up its first workflow.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4 border border-hairline bg-surface p-4">
        <div>
          <label className="block text-xs font-medium text-muted">Business name</label>
          <input
            {...register("name", { required: true })}
            placeholder="SweetCrust Bakery"
            className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Business type</label>
          <input
            {...register("businessType", { required: true })}
            placeholder="cake_shop, clinic, real_estate…"
            className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Phone number (optional)</label>
          <input
            {...register("phoneNumber")}
            placeholder="+91 98765 43210"
            className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted">Default language</label>
          <select {...register("defaultLanguage")} className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </div>

        <div className="border-t border-hairline pt-4">
          <label className="block text-xs font-medium text-muted">Owner user ID</label>
          <input
            {...register("ownerId", { required: true })}
            placeholder="a1b2c3d4-..."
            className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink"
          />
          <p className="mt-1.5 text-xs text-muted">
            This app doesn&apos;t have login/signup built yet, so businesses aren&apos;t tied to a real session — this
            field is a temporary stand-in. Find your user ID in Supabase: <strong>Authentication → Users</strong>,
            click a user, copy the <strong>User UID</strong>. If you don&apos;t have one yet, create one there first.
          </p>
        </div>

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Creating…" : "Create business"}
        </Button>
      </form>
    </div>
  );
}