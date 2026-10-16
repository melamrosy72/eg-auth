import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toApiError } from '@/lib/http'
import { useAuth } from './auth-context'
import { FormAlert, FormField, PasswordInput, SubmitButton } from './form-fields'
import { signInSchema } from './schemas'
import { reportServerError } from './server-errors'

export function SignInForm() {
  const { signIn } = useAuth()
  const [alert, setAlert] = useState<string[] | null>(null)
  const {
    register,
    handleSubmit,
    resetField,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  })

  // On success the auth status flips and PublicOnlyRoute navigates away.
  const onSubmit = handleSubmit(async (values) => {
    setAlert(null)
    try {
      await signIn(values)
    } catch (e) {
      const error = toApiError(e)
      if (error.status === 401) {
        setAlert(['Invalid email or password'])
        resetField('password')
        setFocus('password')
        return
      }
      setAlert(reportServerError(error))
    }
  })

  return (
    <form noValidate onSubmit={onSubmit}>
      <FieldGroup>
        <FormAlert messages={alert} />
        <FormField id="email" label="Email" error={errors.email?.message}>
          {(control) => <Input {...control} type="email" autoComplete="email" {...register('email')} />}
        </FormField>
        <FormField id="password" label="Password" error={errors.password?.message}>
          {(control) => <PasswordInput {...control} autoComplete="current-password" {...register('password')} />}
        </FormField>
        <SubmitButton pending={isSubmitting}>Sign in</SubmitButton>
      </FieldGroup>
    </form>
  )
}
