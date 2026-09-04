"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import { Button } from "@/components/ui/button";

/**
 * Scoping note (see README): this builder creates ONE intent per workflow.
 * The underlying schema/API (lib/validations/workflow.ts, POST /api/workflows)
 * supports multiple intents per workflow — a cake shop's "order_cake" vs
 * "general_enquiry" split, as seeded in supabase/seed.sql, was built by hand
 * via SQL/API, not through this UI yet. Extending this wizard to a list of
 * intents is a matter of wrapping the intent-editing section below in
 * another useFieldArray, not a redesign — deferred here to ship a builder
 * that handles the common single-intent case (repair services, real estate
 * leads, etc.) completely rather than a multi-intent one partially.
 *
 * Similarly, conditions in this UI only produce `set_priority` outcomes
 * (the exact case demoed in the assignment: "if required within 24h, mark
 * urgent") — the schema also supports `require_field` and `trigger_action`
 * outcomes, reachable via the API directly but not yet from this form.
 */

const FIELD_TYPES = ["text", "number", "date", "time", "phone", "select", "address"] as const;
const CONDITION_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "within_hours", "contains"] as const;
const ACTION_TYPES = [
  { value: "create_enquiry", label: "Create enquiry" },
  { value: "create_followup", label: "Create follow-up" },
  { value: "notify_owner", label: "Notify owner" },
  { value: "create_calendar_event", label: "Create calendar event" },
  { value: "mark_urgent", label: "Mark urgent" },
] as const;

interface FormValues {
  businessId: string;
  name: string;
  greeting: string;
  assistantRole: string;
  tone: string;
  restrictions: string;
  closingMessage: string;
  language: "en" | "hi";
  intentKey: string;
  intentLabel: string;
  intentDescription: string;
  fields: {
    fieldName: string;
    label: string;
    fieldType: (typeof FIELD_TYPES)[number];
    description: string;
    required: boolean;
    selectOptionsCsv: string; // comma-separated, only read when fieldType === "select"
  }[];
  conditions: { field: string; op: (typeof CONDITION_OPS)[number]; value: string; priorityValue: "urgent" | "normal" }[];
  actionTypes: string[]; // checked action type values
}

const STEPS = ["Basics", "AI Behaviour", "Information Collection", "Conditional Logic", "Actions", "Review"] as const;

export default function NewWorkflowPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, control, handleSubmit, watch, formState } = useForm<FormValues>({
    defaultValues: {
      businessId: "",
      name: "",
      greeting: "",
      assistantRole: "",
      tone: "friendly_professional",
      restrictions: "",
      closingMessage: "",
      language: "en",
      intentKey: "",
      intentLabel: "",
      intentDescription: "",
      fields: [{ fieldName: "", label: "", fieldType: "text", description: "", required: true, selectOptionsCsv: "" }],
      conditions: [],
      actionTypes: ["create_enquiry", "create_followup"],
    },
  });

  const fieldsArray = useFieldArray({ control, name: "fields" });
  const conditionsArray = useFieldArray({ control, name: "conditions" });
  const values = watch();

  useEffect(() => {
    fetch("/api/businesses")
      .then((r) => r.json())
      .then((data) => setBusinesses(data.businesses ?? []))
      .catch(() => setBusinesses([]));
  }, []);

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      businessId: data.businessId,
      name: data.name,
      trigger: "missed_call" as const,
      greeting: data.greeting,
      assistantRole: data.assistantRole,
      tone: data.tone,
      restrictions: data.restrictions || undefined,
      closingMessage: data.closingMessage,
      language: data.language,
      intents: [
        {
          intentKey: data.intentKey,
          label: data.intentLabel,
          description: data.intentDescription || undefined,
          displayOrder: 0,
          fields: data.fields.map((f, i) => ({
            fieldName: f.fieldName,
            label: f.label,
            fieldType: f.fieldType,
            description: f.description || undefined,
            required: f.required,
            selectOptions:
              f.fieldType === "select"
                ? f.selectOptionsCsv.split(",").map((s) => s.trim()).filter(Boolean)
                : undefined,
            displayOrder: i,
          })),
          conditions: data.conditions.map((c) => ({
            condition: { field: c.field, op: c.op, value: c.op === "within_hours" || ["gt", "gte", "lt", "lte"].includes(c.op) ? Number(c.value) : c.value },
            resultingAction: { type: "set_priority" as const, value: c.priorityValue },
            priority: 0,
          })),
          actions: data.actionTypes.map((actionType) => ({ actionType: actionType as any, triggerOn: "completion" as const })),
        },
      ],
    };

    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "creation_failed");
      }
      const { workflowId } = await res.json();
      router.push(`/workflows/${workflowId}/created`);
    } catch {
      setSubmitError("Couldn't save this workflow. Check that every required field above is filled in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold text-ink">New workflow</h1>

      <ol className="mt-4 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded px-2 py-1 ${i === step ? "bg-accent-subtle text-accent" : i < step ? "text-success" : "text-muted"}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6">
        {step === 0 && (
          <Section>
            <label className="block text-xs font-medium text-muted">Business</label>
            <select {...register("businessId", { required: true })} className={selectClass}>
              <option value="">Select a business…</option>
              {(businesses ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-xs font-medium text-muted">Workflow name</label>
            <input {...register("name", { required: true })} placeholder="Missed Call — Cake Enquiry" className={inputClass} />

            <p className="mt-4 text-sm text-muted">Trigger: <span className="text-ink">Missed call</span> (the only trigger available today — more can be added later without changing this form)</p>
          </Section>
        )}

        {step === 1 && (
          <Section>
            <Field label="Greeting" hint="What the assistant says first">
              <textarea {...register("greeting", { required: true })} rows={2} className={inputClass} />
            </Field>
            <Field label="Assistant role" hint="Describes who the assistant is and what it should do">
              <textarea {...register("assistantRole", { required: true })} rows={2} className={inputClass} />
            </Field>
            <Field label="Tone">
              <input {...register("tone")} className={inputClass} />
            </Field>
            <Field label="Restrictions" hint="e.g. Never give medical advice">
              <textarea {...register("restrictions")} rows={2} className={inputClass} />
            </Field>
            <Field label="Closing message">
              <textarea {...register("closingMessage", { required: true })} rows={2} className={inputClass} />
            </Field>
            <Field label="Language">
              <select {...register("language")} className={selectClass}>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </Field>
          </Section>
        )}

        {step === 2 && (
          <Section>
            <Field label="Intent key" hint="snake_case, e.g. order_cake">
              <input {...register("intentKey", { required: true })} className={inputClass} />
            </Field>
            <Field label="Intent label">
              <input {...register("intentLabel", { required: true })} className={inputClass} />
            </Field>
            <Field label="Intent description" hint="Helps the AI classify this intent correctly">
              <textarea {...register("intentDescription")} rows={2} className={inputClass} />
            </Field>

            <h3 className="mb-2 mt-6 text-sm font-medium text-ink">Fields to collect</h3>
            <div className="space-y-4">
              {fieldsArray.fields.map((field, index) => (
                <div key={field.id} className="border border-hairline p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted">Field name (snake_case)</label>
                      <input {...register(`fields.${index}.fieldName`, { required: true })} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted">Label</label>
                      <input {...register(`fields.${index}.label`, { required: true })} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted">Type</label>
                      <select {...register(`fields.${index}.fieldType`)} className={selectClass}>
                        {FIELD_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" {...register(`fields.${index}.required`)} />
                        Required
                      </label>
                    </div>
                  </div>
                  {values.fields?.[index]?.fieldType === "select" && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-muted">Options (comma-separated)</label>
                      <input {...register(`fields.${index}.selectOptionsCsv`)} placeholder="Chocolate, Vanilla, Red Velvet" className={inputClass} />
                    </div>
                  )}
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-muted">Description / help text for the AI</label>
                    <input {...register(`fields.${index}.description`)} className={inputClass} />
                  </div>
                  {fieldsArray.fields.length > 1 && (
                    <button type="button" onClick={() => fieldsArray.remove(index)} className="mt-2 text-xs text-danger">
                      Remove field
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() =>
                fieldsArray.append({ fieldName: "", label: "", fieldType: "text", description: "", required: false, selectOptionsCsv: "" })
              }
            >
              Add field
            </Button>
          </Section>
        )}

        {step === 3 && (
          <Section>
            <p className="text-sm text-muted">
              Optional urgency rules. Example: if <code className="font-mono text-xs">required_date</code> is within 24 hours, mark the enquiry urgent.
            </p>
            <div className="mt-4 space-y-3">
              {conditionsArray.fields.map((c, index) => (
                <div key={c.id} className="grid grid-cols-4 gap-2 border border-hairline p-3">
                  <div>
                    <label className="block text-xs font-medium text-muted">Field</label>
                    <input {...register(`conditions.${index}.field`)} placeholder="required_date" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted">Operator</label>
                    <select {...register(`conditions.${index}.op`)} className={selectClass}>
                      {CONDITION_OPS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted">Value</label>
                    <input {...register(`conditions.${index}.value`)} placeholder="24" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted">Then priority</label>
                    <select {...register(`conditions.${index}.priorityValue`)} className={selectClass}>
                      <option value="urgent">Urgent</option>
                      <option value="normal">Normal</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => conditionsArray.remove(index)} className="col-span-4 text-left text-xs text-danger">
                    Remove condition
                  </button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => conditionsArray.append({ field: "", op: "within_hours", value: "24", priorityValue: "urgent" })}
            >
              Add condition
            </Button>
          </Section>
        )}

        {step === 4 && (
          <Section>
            <p className="text-sm text-muted">What should happen once the conversation is complete.</p>
            <div className="mt-3 space-y-2">
              {ACTION_TYPES.map((a) => (
                <label key={a.value} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" value={a.value} {...register("actionTypes")} />
                  {a.label}
                </label>
              ))}
            </div>
          </Section>
        )}

        {step === 5 && (
          <Section>
            <h3 className="text-sm font-medium text-ink">Review</h3>
            <div className="mt-3 space-y-1 text-sm text-muted">
              <p><span className="text-ink">Workflow:</span> {values.name || "(untitled)"}</p>
              <p><span className="text-ink">Greeting:</span> {values.greeting}</p>
              <p><span className="text-ink">Intent:</span> {values.intentLabel} ({values.intentKey})</p>
              <p><span className="text-ink">Fields:</span> {values.fields?.map((f) => f.label).filter(Boolean).join(", ") || "none"}</p>
              <p><span className="text-ink">Conditions:</span> {values.conditions?.length ?? 0} configured</p>
              <p><span className="text-ink">Actions:</span> {values.actionTypes?.join(", ") || "none"}</p>
            </div>
            {submitError && <p className="mt-3 text-sm text-danger">{submitError}</p>}
          </Section>
        )}

        <div className="mt-6 flex justify-between">
          <Button type="button" variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save workflow"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="border border-hairline bg-surface p-4">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-muted">{label}</label>
      {hint && <p className="mb-1 text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

const inputClass = "mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink";
const selectClass = inputClass;
