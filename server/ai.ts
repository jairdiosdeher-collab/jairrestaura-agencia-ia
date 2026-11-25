import { GoogleGenAI, Type } from '@google/genai';
import type { AIExplanation, ConnectorKey, WorkflowStep } from '../src/types.ts';

export interface DesignedWorkflowResult {
  source: 'gemini' | 'local_parser';
  modelUsed: string;
  name: string;
  sector: string;
  description: string;
  goal: string;
  inputs: string[];
  outputs: string[];
  missingInfo: string[];
  recommendedPlan: 'inicial' | 'profesional' | 'empresarial';
  estimatedDays: number;
  steps: WorkflowStep[];
  explanation: AIExplanation;
}

const VALID_CONNECTORS: ConnectorKey[] = [
  'internal_crm',
  'web_form',
  'webhook',
  'whatsapp',
  'gmail',
  'google_calendar',
  'google_sheets',
  'telegram',
  'external_api',
];

const VALID_STEP_TYPES = [
  'trigger',
  'ai_interpret',
  'condition',
  'action',
  'crm_record',
  'notification',
] as const;

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

export async function designWorkflowWithGemini(instruction: string): Promise<DesignedWorkflowResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY_NOT_CONFIGURED: No hay una clave GEMINI_API_KEY configurada en el servidor (Settings > Secrets).',
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = `Eres JAIR IA AUTOMATIZA, el arquitecto de automatizaciones empresariales de JAIRRESTAURA AUTOMATIZA IA.
Tu misión es convertir instrucciones en español en un plan de automatización estructurado, claro, realista y ejecutable para negocios, iglesias, consultorios, educación o comercio.
Reglas obligatorias:
1. Responde siempre en español profesional, comprensible para usuarios sin conocimientos de programación.
2. Usa exclusivamente los connectorKey permitidos: ${VALID_CONNECTORS.join(', ')}.
3. Usa exclusivamente los type de paso permitidos: ${VALID_STEP_TYPES.join(', ')}.
4. No prometas diagnósticos médicos ni decisiones clínicas automatizadas si el caso es de salud.
5. Incluye al menos 3 y máximo 6 pasos lógicos comenzando siempre por un paso 'trigger', con un paso de validación/condición y un resultado final.
6. Identifica claramente el objetivo ('goal'), las entradas ('inputs'), las salidas ('outputs') y la información faltante por definir ('missingInfo').
7. Explica con honestidad los permisos requeridos y posibles costos externos.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Diseña una automatización completa para la siguiente necesidad del cliente:\n"${instruction}"`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nombre claro de la automatización' },
          sector: { type: Type.STRING, description: 'Sector o industria aplicable' },
          description: { type: Type.STRING, description: 'Resumen ejecutivo en 1-2 frases' },
          goal: { type: Type.STRING, description: 'Objetivo empresarial principal detectado' },
          inputs: { type: Type.ARRAY, items: { type: Type.STRING } },
          outputs: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingInfo: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendedPlan: {
            type: Type.STRING,
            description: 'Uno de: inicial, profesional, empresarial',
          },
          estimatedDays: { type: Type.INTEGER, description: 'Días estimados de implementación' },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                type: { type: Type.STRING },
                description: { type: Type.STRING },
                connectorKey: { type: Type.STRING },
                configSummary: { type: Type.STRING },
                conditionRule: { type: Type.STRING },
                requiredFields: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['title', 'type', 'description', 'connectorKey', 'configSummary'],
            },
          },
          explanation: {
            type: Type.OBJECT,
            properties: {
              whatItDoes: { type: Type.STRING },
              whenItRuns: { type: Type.STRING },
              dataUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
              requiredApps: { type: Type.ARRAY, items: { type: Type.STRING } },
              requiredPermissions: { type: Type.ARRAY, items: { type: Type.STRING } },
              externalCosts: { type: Type.STRING },
            },
            required: [
              'whatItDoes',
              'whenItRuns',
              'dataUsed',
              'requiredApps',
              'requiredPermissions',
              'externalCosts',
            ],
          },
        },
        required: [
          'name',
          'sector',
          'description',
          'goal',
          'inputs',
          'outputs',
          'missingInfo',
          'recommendedPlan',
          'estimatedDays',
          'steps',
          'explanation',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('GEMINI_EMPTY_RESPONSE: El modelo no devolvió contenido estructurado.');
  }

  const parsed = JSON.parse(rawText) as {
    name: string;
    sector: string;
    description: string;
    goal?: string;
    inputs?: string[];
    outputs?: string[];
    missingInfo?: string[];
    recommendedPlan: string;
    estimatedDays: number;
    steps: Array<{
      title: string;
      type: string;
      description: string;
      connectorKey: string;
      configSummary: string;
      conditionRule?: string;
      requiredFields?: string[];
    }>;
    explanation: AIExplanation;
  };

  const planNormalized =
    parsed.recommendedPlan === 'empresarial' || parsed.recommendedPlan === 'profesional'
      ? parsed.recommendedPlan
      : 'inicial';

  const steps: WorkflowStep[] = (parsed.steps || []).slice(0, 7).map((st, idx) => {
    const safeConnector = VALID_CONNECTORS.includes(st.connectorKey as ConnectorKey)
      ? (st.connectorKey as ConnectorKey)
      : 'internal_crm';
    const safeType = (VALID_STEP_TYPES as readonly string[]).includes(st.type)
      ? (st.type as WorkflowStep['type'])
      : idx === 0
        ? 'trigger'
        : 'action';
    return {
      id: `ia-step-${Date.now()}-${idx + 1}`,
      order: idx + 1,
      type: safeType,
      title: st.title || `Paso ${idx + 1}`,
      description: st.description || '',
      connectorKey: safeConnector,
      configSummary: st.configSummary || 'Configuración estándar',
      conditionRule: st.conditionRule || undefined,
      dependsOnOrder: idx === 0 ? undefined : idx,
      requiredFields: Array.isArray(st.requiredFields) ? st.requiredFields : undefined,
    };
  });

  return {
    source: 'gemini',
    modelUsed: 'gemini-4-hydrogen',
    name: parsed.name || 'Automatización diseñada con JAIR IA',
    sector: parsed.sector || 'General',
    description: parsed.description || instruction.slice(0, 140),
    goal: parsed.goal || parsed.description || instruction.slice(0, 120),
    inputs: Array.isArray(parsed.inputs) && parsed.inputs.length > 0 ? parsed.inputs : parsed.explanation.dataUsed,
    outputs:
      Array.isArray(parsed.outputs) && parsed.outputs.length > 0
        ? parsed.outputs
        : steps.filter((s) => s.type !== 'trigger').map((s) => s.title),
    missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
    recommendedPlan: planNormalized,
    estimatedDays: Math.max(1, Math.min(30, Number(parsed.estimatedDays) || 4)),
    steps,
    explanation: parsed.explanation,
  };
}

// Explicit local non-AI deterministic planner (works 100% without Gemini)
export function designWorkflowLocally(instruction: string): DesignedWorkflowResult {
  const lower = instruction.toLowerCase();
  const steps: WorkflowStep[] = [];
  const requiredApps: string[] = [];
  const requiredPermissions: string[] = [];
  const dataUsed: string[] = ['Nombre completo'];
  const inputs: string[] = ['Nombre de contacto', 'Teléfono / WhatsApp'];
  const outputs: string[] = [];
  const missingInfo: string[] = [];
  let order = 1;

  const usesWhatsApp = lower.includes('whatsapp') || lower.includes('wsp') || lower.includes('chat');
  const usesCalendar = lower.includes('cita') || lower.includes('agenda') || lower.includes('calendario');
  const usesSheets =
    lower.includes('inventario') ||
    lower.includes('hoja') ||
    lower.includes('sheets') ||
    lower.includes('excel') ||
    lower.includes('lote') ||
    lower.includes('organizar');
  const usesGmail =
    lower.includes('correo') ||
    lower.includes('email') ||
    lower.includes('gmail') ||
    lower.includes('cotiz') ||
    lower.includes('confirmaci');
  const usesTelegram = lower.includes('telegram') || lower.includes('alerta interna') || lower.includes('equipo');
  const usesWebhook = lower.includes('webhook') || lower.includes('tienda') || lower.includes('api');

  // Step 1: Trigger
  if (usesWhatsApp) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'trigger',
      title: 'Disparador inicial: mensaje entrante por WhatsApp',
      description: 'Detecta cuando una persona escribe solicitando información o atención.',
      connectorKey: 'whatsapp',
      configSummary: 'Webhook oficial WhatsApp Business API',
      requiredFields: ['nombre', 'telefono'],
    });
    requiredApps.push('WhatsApp Business API');
    requiredPermissions.push('Lectura de mensajes entrantes y envío de respuestas');
    dataUsed.push('Número de teléfono');
    missingInfo.push('Configurar Phone Number ID y token permanente de WhatsApp Business API.');
  } else if (usesWebhook) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'trigger',
      title: 'Disparador inicial: evento por Webhook firmado',
      description: 'Recibe datos estructurados desde una aplicación o tienda externa.',
      connectorKey: 'webhook',
      configSummary: 'Verificación HMAC-SHA256 obligatoria',
      requiredFields: ['nombre'],
    });
    requiredApps.push('Webhooks Firmados');
    requiredPermissions.push('Firma compartida HMAC');
  } else {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'trigger',
      title: 'Disparador inicial: solicitud desde Formulario Web',
      description: 'Captura datos básicos del solicitante con autorización Ley 1581 de 2012.',
      connectorKey: 'web_form',
      configSummary: 'Validación local con consentimiento Habeas Data',
      requiredFields: usesGmail ? ['nombre', 'telefono', 'correo'] : ['nombre', 'telefono'],
    });
    requiredApps.push('Formularios Web JairRestaura');
    requiredPermissions.push('Registro de consentimiento Habeas Data');
  }

  // Step 2: Validation / Condition
  steps.push({
    id: `loc-${order}`,
    order: order,
    type: 'condition',
    title: 'Validación de datos obligatorios y horario',
    description: 'Verifica que el contacto tenga datos completos y autorización antes de procesar.',
    connectorKey: 'internal_crm',
    configSummary: 'Regla: nombre y teléfono válidos (más correo si aplica)',
    conditionRule: usesGmail
      ? 'Requiere nombre, teléfono y correo electrónico válido'
      : 'Requiere nombre y teléfono válido',
    dependsOnOrder: order - 1,
  });
  order++;

  if (usesCalendar) {
    inputs.push('Fecha y hora preferida', 'Servicio solicitado');
    steps.push({
      id: `loc-${order}`,
      order: order,
      type: 'action',
      title: 'Organización de cita y disponibilidad',
      description: 'Consulta franjas disponibles y organiza la solicitud de cita en agenda.',
      connectorKey: 'google_calendar',
      configSummary: 'Sincronización con Google Calendar',
      dependsOnOrder: order - 1,
    });
    order++;
    requiredApps.push('Google Calendar');
    requiredPermissions.push('Lectura de disponibilidad y creación de eventos');
    dataUsed.push('Fecha y hora preferida');
    outputs.push('Cita organizada en agenda');
    missingInfo.push('Definir horarios de atención, duración de citas y token de Google Calendar.');
  }

  if (usesSheets) {
    steps.push({
      id: `loc-${order}`,
      order: order,
      type: 'action',
      title: 'Organización y registro tabular en Google Sheets',
      description: 'Clasifica y agrega una fila ordenada para control operativo del negocio.',
      connectorKey: 'google_sheets',
      configSummary: 'Actualización por fila verificada',
      dependsOnOrder: order - 1,
    });
    order++;
    requiredApps.push('Google Sheets');
    requiredPermissions.push('Lectura y escritura en hoja específica');
    outputs.push('Registro organizado en hoja de cálculo');
    missingInfo.push('Indicar el Spreadsheet ID de Google Sheets y verificar token de acceso.');
  }

  if (usesGmail) {
    inputs.push('Correo electrónico');
    steps.push({
      id: `loc-${order}`,
      order: order,
      type: 'notification',
      title: 'Confirmación automática al cliente por correo',
      description: 'Envía confirmación formal con resumen de la solicitud y próximos pasos.',
      connectorKey: 'gmail',
      configSummary: 'Plantilla editable desde cuenta Gmail autorizada',
      dependsOnOrder: order - 1,
    });
    order++;
    requiredApps.push('Gmail');
    requiredPermissions.push('Envío de correos desde cuenta autorizada');
    dataUsed.push('Correo electrónico');
    outputs.push('Correo de confirmación enviado al cliente');
    missingInfo.push('Configurar y verificar la cuenta Gmail remitente en Conectores.');
  } else if (usesWhatsApp) {
    steps.push({
      id: `loc-${order}`,
      order: order,
      type: 'notification',
      title: 'Respuesta de bienvenida y confirmación por WhatsApp',
      description: 'Responde automáticamente al contacto confirmando la recepción de su solicitud.',
      connectorKey: 'whatsapp',
      configSummary: 'Plantilla de bienvenida editable',
      dependsOnOrder: order - 1,
    });
    order++;
    outputs.push('Confirmación enviada por WhatsApp');
  }

  if (usesTelegram) {
    steps.push({
      id: `loc-${order}`,
      order: order,
      type: 'notification',
      title: 'Notificación interna al equipo por Telegram',
      description: 'Informa de inmediato al responsable asignado sin costo externo.',
      connectorKey: 'telegram',
      configSummary: 'Bot privado autorizado',
      dependsOnOrder: order - 1,
    });
    order++;
    requiredApps.push('Telegram Bot API');
    requiredPermissions.push('Envío de mensajes al grupo operativo');
    outputs.push('Alerta inmediata por Telegram');
    missingInfo.push('Configurar token de BotFather y Chat ID en Telegram Bot API.');
  }

  // Final Result Step: Always close with CRM record
  steps.push({
    id: `loc-${order}`,
    order: order,
    type: 'crm_record',
    title: 'Resultado final: registro organizado en CRM JairRestaura',
    description: 'Guarda la ficha del cliente con historial, estado y trazabilidad Ley 1581.',
    connectorKey: 'internal_crm',
    configSummary: 'Motor local verificado · Separación estricta por cliente',
    dependsOnOrder: order - 1,
  });
  requiredApps.push('CRM Interno JairRestaura');
  requiredPermissions.push('Alta y actualización en CRM con cumplimiento Ley 1581');
  outputs.unshift('Ficha y seguimiento registrados en CRM');

  if (missingInfo.length === 0) {
    missingInfo.push('Revisar los campos obligatorios del disparador y probar el flujo en el laboratorio.');
  }

  let sector = 'Servicios Generales';
  let goal = 'Automatizar recepción, validación, organización y respuesta oportuna al cliente.';
  if (lower.includes('iglesia') || lower.includes('oración') || lower.includes('visitante')) {
    sector = 'Iglesias y Ministerios';
    goal = 'Acompañar visitantes y solicitudes pastorales con seguimiento organizado y confidencial.';
  } else if (lower.includes('consultorio') || lower.includes('paciente') || usesCalendar) {
    sector = lower.includes('consultorio') || lower.includes('paciente') ? 'Salud y Bienestar' : 'Servicios y Citas';
    goal = 'Recibir solicitudes de cita, organizarlas por disponibilidad y confirmar al cliente.';
  } else if (lower.includes('esmeralda') || lower.includes('lote')) {
    sector = 'Joyería y Minería Responsable';
    goal = 'Mantener trazabilidad verificable de lotes y solicitudes comerciales.';
  } else if (lower.includes('pedido') || lower.includes('inventario') || lower.includes('venta')) {
    sector = 'Comercio y Pymes';
    goal = 'Capturar pedidos, validar datos y organizar inventario con confirmación al comprador.';
  }

  return {
    source: 'local_parser',
    modelUsed: 'Analizador Estructural Local (Sin IA externa)',
    name: `Flujo: ${instruction.trim().slice(0, 56)}${instruction.trim().length > 56 ? '...' : ''}`,
    sector,
    description:
      'Flujo estructurado localmente mediante análisis determinístico de objetivos, entradas, validaciones, salidas y conectores.',
    goal,
    inputs: Array.from(new Set(inputs)),
    outputs: Array.from(new Set(outputs)),
    missingInfo: Array.from(new Set(missingInfo)),
    recommendedPlan: steps.length >= 4 ? 'profesional' : 'inicial',
    estimatedDays: Math.max(2, steps.length + 1),
    steps,
    explanation: {
      whatItDoes: goal,
      whenItRuns: `Cada vez que se active el disparador "${steps[0]?.title}".`,
      dataUsed: Array.from(new Set(dataUsed)),
      requiredApps: Array.from(new Set(requiredApps)),
      requiredPermissions: Array.from(new Set(requiredPermissions)),
      externalCosts: usesWhatsApp
        ? 'WhatsApp Business API puede generar cargos de Meta según volumen de conversaciones; el motor local JairRestaura no cobra por ejecución.'
        : 'Sin costos de licencias externas obligatorias; opera sobre el motor local de JairRestaura.',
    },
  };
}
