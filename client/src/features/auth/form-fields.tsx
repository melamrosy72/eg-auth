import { CheckIcon, EyeIcon, EyeOffIcon, Loader2Icon, XIcon } from 'lucide-react'
import { type ComponentProps, type ReactNode, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PASSWORD_RULES } from './schemas'

type ControlProps = { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }

// Label, error text and the aria wiring for one input (specs/05 §3).
export function FormField(props: {
  id: string
  label: string
  error?: string
  describedBy?: string
  children: (control: ControlProps) => ReactNode
  after?: ReactNode
}) {
  const { id, label, error, describedBy, children, after } = props
  const errorId = `${id}-error`
  const describedByIds = [error && errorId, describedBy].filter(Boolean).join(' ')
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': describedByIds || undefined })}
      {after}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  )
}

export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-9" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-0.5 -translate-y-1/2"
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </Button>
    </div>
  )
}

const CHECKLIST: { rule: keyof typeof PASSWORD_RULES; label: string }[] = [
  { rule: 'length', label: '8 to 128 characters' },
  { rule: 'letter', label: 'At least one letter' },
  { rule: 'number', label: 'At least one number' },
  { rule: 'special', label: 'At least one special character (space counts)' },
]

export function PasswordChecklist({ id, value }: { id: string; value: string }) {
  return (
    <ul id={id} aria-live="polite" className="flex flex-col gap-1 text-sm">
      {CHECKLIST.map(({ rule, label }) => {
        const met = PASSWORD_RULES[rule](value)
        const Icon = met ? CheckIcon : XIcon
        return (
          <li key={rule} className={`flex items-center gap-2 ${met ? 'text-emerald-700' : 'text-muted-foreground'}`}>
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">{met ? 'Met:' : 'Not met:'}</span>
            {label}
          </li>
        )
      })}
    </ul>
  )
}

export function FormAlert({ messages }: { messages: string[] | null }) {
  if (!messages) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>
        {messages.length === 1 ? (
          messages[0]
        ) : (
          <ul className="list-disc pl-4">
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
      {children}
    </Button>
  )
}
