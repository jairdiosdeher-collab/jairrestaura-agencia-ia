import { GoogleGenAI, Type } from '@google/genai';
import type { AIExplanation, ConnectorKey, WorkflowStep } from '../src/types.ts';

export interface DesignedWorkflowResult {
  source: 'gemini' | 'local_parser';
  modelUsed: string;
  name: string;
  sector: string;
  description: string;
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
5. Incluye al menos 3 y máximo 6 pasos lógicos comenzando siempre por un paso 'trigger'.
6. Explica con honestidad los permisos requeridos y posibles costos externos (como tarifas de WhatsApp Business API o cuentas de correo).`;

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
    recommendedPlan: string;
    estimatedDays: number;
    steps: Array<{
      title: string;
      type: string;
      description: string;
      connectorKey: string;
      configSummary: string;
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
      requiredFields: Array.isArray(st.requiredFields) ? st.requiredFields : undefined,
    };
  });

  return {
    source: 'gemini',
    modelUsed: 'gemini-4-hydrogen',
    name: parsed.name || 'Automatización diseñada con JAIR IA',
    sector: parsed.sector || 'General',
    description: parsed.description || instruction.slice(0, 140),
    recommendedPlan: planNormalized,
    estimatedDays: Math.max(1, Math.min(30, Number(parsed.estimatedDays) || 4)),
    steps,
    explanation: parsed.explanation,
  };
}

// Explicit local non-AI deterministic planner (used ONLY when user explicitly chooses local mode without external AI)
export function designWorkflowLocally(instruction: string): DesignedWorkflowResult {
  const lower = instruction.toLowerCase();
  const steps: WorkflowStep[] = [];
  const requiredApps: string[] = [];
  const requiredPermissions: string[] = [];
  const dataUsed: string[] = ['Nombre de contacto'];
  let order = 1;

  const usesWhatsApp = lower.includes('whatsapp') || lower.includes('wsp') || lower.includes('chat');
  const usesCalendar = lower.includes('cita') || lower.includes('agenda') || lower.includes('calendario');
  const usesSheets =
    lower.includes('inventario') ||
    lower.includes('hoja') ||
    lower.includes('sheets') ||
    lower.includes('excel') ||
    lower.includes('lote');
  const usesGmail = lower.includes('correo') || lower.includes('email') || lower.includes('gmail') || lower.includes('cotiz');
  const usesTelegram = lower.includes('telegram') || lower.includes('alerta interna') || lower.includes('equipo');
  const usesWebhook = lower.includes('webhook') || lower.includes('tienda') || lower.includes('api');

  // Step 1: Trigger
  if (usesWhatsApp) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'trigger',
      title: 'Recepción de mensaje entrante por WhatsApp',
      description: 'Detecta cuando una persona escribe por primera vez o solicita información.',
      connectorKey: 'whatsapp',
      configSummary: 'Webhook oficial WhatsApp Business API',
      requiredFields: ['nombre', 'telefono'],
    });
    requiredApps.push('WhatsApp Business API');
    requiredPermissions.push('Lectura de mensajes entrantes y envío de respuestas');
    dataUsed.push('Número de teléfono');
  } else if (usesWebhook) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'trigger',
      title: 'Recepción de evento por Webhook firmado',
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
      title: 'Captura desde Formulario Web JairRestaura',
      description: 'Recibe solicitud del usuario con aceptación explícita de política de datos.',
      connectorKey: 'web_form',
      configSummary: 'Validación local con consentimiento Ley 1581',
      requiredFields: ['nombre', 'telefono'],
    });
    requiredApps.push('Formularios Web JairRestaura');
    requiredPermissions.push('Registro de consentimiento Habeas Data');
  }

  // Step 2: Welcome / Services presentation if requested
  if (
    lower.includes('bienvenida') ||
    lower.includes('servicio') ||
    lower.includes('pregunta') ||
    usesWhatsApp
  ) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'notification',
      title: 'Presentación de bienvenida y portafolio de servicios',
      description: 'Responde automáticamente con saludo cordial y catálogo de opciones.',
      connectorKey: usesWhatsApp ? 'whatsapp' : usesGmail ? 'gmail' : 'web_form',
      configSummary: 'Respuesta estructurada editable',
    });
  }

  // Step 3: Calendar if appointments mentioned
  if (usesCalendar) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'action',
      title: 'Consulta de horarios y solicitud de cita',
      description: 'Verifica disponibilidad real y agenda la fecha acordada.',
      connectorKey: 'google_calendar',
      configSummary: 'Sincronización con Google Calendar',
    });
    requiredApps.push('Google Calendar');
    requiredPermissions.push('Lectura de disponibilidad y creación de eventos');
    dataUsed.push('Fecha y hora preferida');
  }

  // Step 4: Sheets if inventory / reports
  if (usesSheets) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'action',
      title: 'Actualización de control en Google Sheets',
      description: 'Registra movimientos o consolida datos operativos en hoja maestra.',
      connectorKey: 'google_sheets',
      configSummary: 'Actualización por fila verificada',
    });
    requiredApps.push('Google Sheets');
    requiredPermissions.push('Lectura y escritura en hoja específica');
  }

  // Step 5: Always register in CRM if customer/lead/patient/visitor mentioned or as closing step
  steps.push({
    id: `loc-${order}`,
    order: order++,
    type: 'crm_record',
    title: 'Registro automático en CRM JairRestaura',
    description: 'Crea o actualiza la ficha del cliente con historial y estado comercial.',
    connectorKey: 'internal_crm',
    configSummary: 'Motor local verificado · Separación por cliente',
  });
  requiredApps.push('CRM Interno JairRestaura');
  requiredPermissions.push('Alta y actualización en CRM con cumplimiento Ley 1581');

  if (usesGmail && !steps.some((s) => s.connectorKey === 'gmail')) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'notification',
      title: 'Confirmación y resumen por correo electrónico',
      description: 'Envía confirmación formal al cliente o equipo interno.',
      connectorKey: 'gmail',
      configSummary: 'Cuenta autorizada en conector Gmail',
    });
    requiredApps.push('Gmail');
    requiredPermissions.push('Envío de correos desde cuenta autorizada');
    dataUsed.push('Correo electrónico');
  }

  if (usesTelegram) {
    steps.push({
      id: `loc-${order}`,
      order: order++,
      type: 'notification',
      title: 'Notificación interna al equipo por Telegram',
      description: 'Informa de inmediato al responsable asignado.',
      connectorKey: 'telegram',
      configSummary: 'Bot privado autorizado',
    });
    requiredApps.push('Telegram Bot API');
    requiredPermissions.push('Envío de mensajes al grupo operativo');
  }

  let sector = 'Servicios Generales';
  if (lower.includes('iglesia') || lower.includes('oración') || lower.includes('visitante')) {
    sector = 'Iglesias y Ministerios';
  } else if (lower.includes('consultorio') || lower.includes('paciente')) {
    sector = 'Salud y Bienestar';
  } else if (lower.includes('esmeralda') || lower.includes('lote')) {
    sector = 'Joyería y Minería Responsable';
  } else if (lower.includes('pedido') || lower.includes('inventario') || lower.includes('venta')) {
    sector = 'Comercio y Pymes';
  }

  return {
    source: 'local_parser',
    modelUsed: 'Analizador Estructural Local (Sin IA externa)',
    name: `Flujo: ${instruction.trim().slice(0, 56)}${instruction.trim().length > 56 ? '...' : ''}`,
    sector,
    description:
      'Flujo estructurado localmente mediante análisis determinístico de canales, acciones y requisitos de conexión.',
    recommendedPlan: steps.length >= 4 ? 'profesional' : 'inicial',
    estimatedDays: Math.max(2, steps.length + 1),
    steps,
    explanation: {
      whatItDoes: `Automatiza la secuencia solicitada en ${steps.length} pasos conectados al CRM de JairRestaura.`,
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
