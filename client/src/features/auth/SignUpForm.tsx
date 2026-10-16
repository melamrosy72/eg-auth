import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toApiError } from '@/lib/http'
import { useAuth } from './auth-context'
import { FormAlert, FormField, PasswordChecklist, PasswordInput, SubmitButton } from './form-fields'
import { signUpSchema } from './schemas'
import { reportServerError } from './server-errors'

export function SignUpForm() {
  const { signUp } = useAuth()
  const [alert, setAlert] = useState<string[] | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signUpSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', password: '' },
  })
  const password = useWatch({ control, name: 'password' })

  // On success the auth status flips and PublicOnlyRoute navigates to /app.
  const onSubmit = handleSubmit(async (values) => {
    setAlert(null)
    try {
      await signUp(values)
    } catch (e) {
      const error = toApiError(e)
      if (error.status === 409) {
        setError('email', { message: 'Email is already registered' }, { shouldFocus: true })
        return
      }
      setAlert(reportServerError(error))
    }
  })

  return (
    <form noValidate onSubmit={onSubmit}>
      <FieldGroup>
        <FormAlert messages={alert} />
        <FormField id="name" label="Name" error={errors.name?.message}>
          {(c) => <Input {...c} autoComplete="name" {...register('name')} />}
        </FormField>
        <FormField id="email" label="Email" error={errors.email?.message}>
          {(c) => <Input {...c} type="email" autoComplete="email" {...register('email')} />}
        </FormField>
        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
          describedBy="password-rules"
          after={<PasswordChecklist id="password-rules" value={password} />}
        >
          {(c) => <PasswordInput {...c} autoComplete="new-password" {...register('password')} />}
        </FormField>
        <SubmitButton pending={isSubmitting}>Create account</SubmitButton>
      </FieldGroup>
    </form>
  )
}
