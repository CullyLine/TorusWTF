import { NextResponse } from 'next/server';
import { SERVICES } from '@torus/shared';

export const dynamic = 'force-dynamic';

/** GET /api/v1/openapi.json — machine-readable spec for agents/tools. */
export function GET(req: Request) {
  const base = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  const stems = SERVICES.stems;

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'TorusFM API',
      version: '1.0.0',
      description:
        'Audio compute services billed in prepaid credits (1 credit = 1 US cent). ' +
        'Authenticate with an API key: `Authorization: Bearer tk_live_...`.',
    },
    servers: [{ url: `${base}/api/v1` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
      schemas: {
        Job: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            service: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'running', 'succeeded', 'failed'] },
            creditCost: { type: 'integer' },
            outputs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  downloadUrl: { type: 'string' },
                  bytes: { type: 'integer' },
                },
              },
            },
            error: { type: ['string', 'null'] },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      '/services': {
        get: {
          summary: 'List available services and pricing',
          security: [],
          responses: { '200': { description: 'Service catalog' } },
        },
      },
      '/stems': {
        post: {
          summary: stems.label,
          description: `${stems.description} Costs ${stems.creditCost} credits per call.`,
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['audioUrl'],
                  properties: {
                    audioUrl: { type: 'string', description: 'Public URL of the audio file.' },
                    wait: {
                      type: 'boolean',
                      description: 'If true, block until the job finishes and return outputs.',
                    },
                  },
                },
              },
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary' },
                    wait: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Completed job (when wait=true)',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } },
            },
            '202': { description: 'Job accepted; poll statusUrl' },
            '402': { description: 'Insufficient credits' },
          },
        },
      },
      '/jobs/{id}': {
        get: {
          summary: 'Get job status and results',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Job',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } },
            },
            '404': { description: 'Not found' },
          },
        },
      },
    },
  };

  return NextResponse.json(spec);
}
