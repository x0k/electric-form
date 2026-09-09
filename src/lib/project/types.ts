import type * as v from 'valibot';
import type {
  ConsumerKindSchema,
  GeneralSchema,
  LightingSchema,
  LowVoltageSchema,
  MetaSchema,
  PanelOptionsSchema,
  PanelSchema,
  PowerConsumerSchema,
  PowerSchema,
  ProjectSchema,
  ScopeSchema,
  SensorsSchema,
  WorkSchema,
} from './schemas';

export type Meta = v.InferOutput<typeof MetaSchema>;
export type General = v.InferOutput<typeof GeneralSchema>;
export type ConsumerKind = v.InferOutput<typeof ConsumerKindSchema>;
export type PowerConsumer = v.InferOutput<typeof PowerConsumerSchema>;
export type Power = v.InferOutput<typeof PowerSchema>;
export type LowVoltage = v.InferOutput<typeof LowVoltageSchema>;
export type Lighting = v.InferOutput<typeof LightingSchema>;
export type Sensors = v.InferOutput<typeof SensorsSchema>;
export type PanelOptions = v.InferOutput<typeof PanelOptionsSchema>;
export type Panel = v.InferOutput<typeof PanelSchema>;
export type Work = v.InferOutput<typeof WorkSchema>;
export type Scope = v.InferOutput<typeof ScopeSchema>;
export type Project = v.InferOutput<typeof ProjectSchema>;
export type ProjectInput = v.InferInput<typeof ProjectSchema>;
