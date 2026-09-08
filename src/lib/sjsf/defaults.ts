import addFormats from 'ajv-formats';
import { addFormComponents, createFormValidator } from '@sjsf/ajv8-validator';
import { createFocusOnFirstError } from '@sjsf/form/focus-on-first-error';
import '@sjsf/daisyui5-theme/extra-widgets/textarea-include';
import type {
  FormState,
  ResolveFieldType,
  ValidatorFactoryOptions,
} from '@sjsf/form';
import { getSimpleSchemaType, isFixedItems } from '@sjsf/form/core';

// import "@sjsf/form/fields/extra/aggregated-include";
// import "@sjsf/form/fields/extra/array-files-include";
// import "@sjsf/form/fields/extra/array-native-files-include";
// import "@sjsf/form/fields/extra/array-tags-include";
// import "@sjsf/form/fields/extra/boolean-select-include";
// import "@sjsf/form/fields/extra/enum-include";
// import "@sjsf/form/fields/extra/file-include";
// import "@sjsf/form/fields/extra/multi-enum-include";
// import "@sjsf/form/fields/extra/object-key-enum-include";
// import "@sjsf/form/fields/extra/remote-enum-include";
// import "@sjsf/form/fields/extra/unknown-native-file-include";
// https://x0k.dev/svelte-jsonschema-form/guides/fields-resolution/
export function resolver<T>(_ctx: FormState<T>): ResolveFieldType {
  return ({ schema }) => {
    if (schema.oneOf !== undefined) {
      return 'oneOfField';
    }

    if (schema.anyOf !== undefined) {
      return 'anyOfField';
    }

    const type = getSimpleSchemaType(schema);

    if (type === 'array') {
      return isFixedItems(schema) ? 'tupleField' : 'arrayField';
    }

    return `${type}Field`;
  };
}

export { translation } from '@sjsf/form/translations/en';
export { createFormMerger as merger } from '@sjsf/form/mergers/modern';
export { createFormIdBuilder as idBuilder } from '@sjsf/form/id-builders/modern';

// import "@sjsf/daisyui5-theme/extra-widgets/cally-date-picker-include";
// import "@sjsf/daisyui5-theme/extra-widgets/checkboxes-include";
// import "@sjsf/daisyui5-theme/extra-widgets/date-picker-include";
// import "@sjsf/daisyui5-theme/extra-widgets/file-include";
// import "@sjsf/daisyui5-theme/extra-widgets/filter-radio-buttons-include";
// import "@sjsf/daisyui5-theme/extra-widgets/multi-select-include";
// import "@sjsf/daisyui5-theme/extra-widgets/radio-buttons-include";
// import "@sjsf/daisyui5-theme/extra-widgets/radio-include";
// import "@sjsf/daisyui5-theme/extra-widgets/range-include";
// import "@sjsf/daisyui5-theme/extra-widgets/rating-include";
// import "@sjsf/daisyui5-theme/extra-widgets/switch-include";
// import "@sjsf/daisyui5-theme/extra-widgets/vc-date-picker-include";
export { theme } from '@sjsf/daisyui5-theme';

export { icons } from '@sjsf/lucide-icons';
export const onSubmitError = createFocusOnFirstError();

export function validator<T>(options: ValidatorFactoryOptions) {
  return createFormValidator<T>({
    ...options,
    ajvPlugins: (ajv) => addFormComponents(addFormats(ajv)),
  });
}
