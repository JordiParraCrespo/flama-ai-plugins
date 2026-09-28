import {
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Label,
} from '@flama/design-system-web';
import { useController, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

/** The part of the create-token form this field owns. */
type RestrictedToken = { organizationIds: string[] };

/**
 * The organizations a new token may be restricted to, as a field of the
 * create-token form: it reads the form from its context, and the section that
 * renders it fetches the organizations. Nothing to restrict to, nothing shown.
 *
 * Until the organizations have loaded — or when they fail to — the field
 * refuses the submit: a token sent then could not have been restricted, and
 * would be minted with the reach of every organization its owner is in.
 */
export function OrganizationRestrictionField({
  organizations = [],
  status,
}: {
  organizations?: readonly { id: string; name: string }[];
  status: 'pending' | 'error' | 'success';
}) {
  const { t } = useTranslation();
  const unavailable = t('apiTokens.organizationsUnavailable');
  const { field, fieldState } = useController<RestrictedToken, 'organizationIds'>({
    name: 'organizationIds',
    rules: { validate: () => status === 'success' || unavailable },
  });
  const { isSubmitting } = useFormState();

  if (status === 'success' && organizations.length === 0) return null;
  const error = status === 'error' ? unavailable : fieldState.error?.message;
  return (
    <Field>
      <FieldLabel>{t('apiTokens.organizations')}</FieldLabel>
      <FieldDescription>{t('apiTokens.organizationsHint')}</FieldDescription>
      <div className="flex flex-col gap-2">
        {organizations.map((organization) => (
          <div key={organization.id} className="flex items-center gap-2">
            <Checkbox
              id={`org-${organization.id}`}
              checked={field.value.includes(organization.id)}
              onCheckedChange={(checked) =>
                field.onChange(
                  checked
                    ? [...field.value, organization.id]
                    : field.value.filter((id) => id !== organization.id),
                )
              }
              disabled={isSubmitting}
            />
            <Label htmlFor={`org-${organization.id}`} className="cursor-pointer text-sm">
              {organization.name}
            </Label>
          </div>
        ))}
      </div>
      <FieldError errors={[error ? { message: error } : undefined]} />
    </Field>
  );
}
