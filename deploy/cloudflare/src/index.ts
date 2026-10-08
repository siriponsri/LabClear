import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  LABCLEAR: DurableObjectNamespace<LabClearContainer>;
  DATABASE_URL: string;
  BUSINESS_DATA_KEY: string;
  BUSINESS_PUBLIC_URL: string;
  OPENROUTER_API_KEY?: string;
  GUARD_API_KEY?: string;
  PROVIDER_NETWORK_ENABLED?: string;
  PROVIDER_BUDGET_CYCLE_ID?: string;
  CLOUD_CALL_LIMIT?: string;
  PROJECT_BUDGET_THB?: string;
  PROJECT_BUDGET_PRIOR_SPEND_THB?: string;
  LABCLEAR_COMMIT_SHA?: string;
  BUSINESS_WORKER_ENABLED?: string;
  [key: string]: unknown;
}
const optional = ['OPENROUTER_API_KEY','OPENROUTER_SORT','PARALLEL_CHECKS','EMBEDDING_DIMENSIONS','TRUSTED_ORIGINS','LLM_PROVIDER','LLM_MODEL','LLM_API_KEY','VISION_ENABLED','VISION_PROVIDER','VISION_MODEL','VISION_API_KEY',
  'GUARD_PROVIDER','GUARD_API_KEY','GUARD_MODEL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI','GOOGLE_MAPS_EMBED_KEY',
  'PROVIDER_NETWORK_ENABLED','PROVIDER_BUDGET_CYCLE_ID','CLOUD_CALL_LIMIT','PROJECT_BUDGET_THB','PROJECT_BUDGET_PRIOR_SPEND_THB','MODEL_PRICES_THB',
  'OPENROUTER_AGENT_PROFILE','OPENROUTER_DATA_COLLECTION','OPENROUTER_ZDR','AGENT_PLAN_MODEL','AGENT_ADVISOR_MODEL','AGENT_EXPLAINER_MODEL','AGENT_REVIEW_MODEL',
  'EMBEDDING_ENABLED','EMBEDDING_MODEL','EMBEDDING_INDEX_PATH','DEMO_ACCESS_CODE','DEMO_ACCOUNTS','BUSINESS_EXTERNAL_ENABLED','BUSINESS_WORKER_ENABLED',
  'LINE_CHANNEL_SECRET','LINE_CHANNEL_ACCESS_TOKEN','LINE_ALLOW_PUSH','LABCLEAR_COMMIT_SHA','BUSINESS_WORKER_SECRET'];

export class LabClearContainer extends Container<Env> {
  defaultPort = 8080;
  // Guest idle TTL is 20m. A restart still invalidates a temporary chat safely.
  sleepAfter = '25m';
  enableInternet = true;
  envVars: Record<string,string>;
  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx,env);
    this.envVars={APP_ENV:'production',PORT:'8080',WEB_CONCURRENCY:'1',DATABASE_URL:env.DATABASE_URL || '',
      BUSINESS_DATA_KEY:env.BUSINESS_DATA_KEY || '',BUSINESS_PUBLIC_URL:env.BUSINESS_PUBLIC_URL || '',
      FORWARDED_ALLOW_IPS:'*',LLM_PROVIDER:'openrouter'};
    for(const key of optional)if(typeof env[key]==='string')this.envVars[key]=env[key] as string;
  }
}
/*
 * Requests arrive from the website worker through the "API" service binding with the visitor's
 * original URL, so Host/Origin checks in FastAPI see the public hostname.
 */
export default {
  async fetch(request: Request,env: Env): Promise<Response> {
    const url=new URL(request.url);
    if(url.protocol!=='https:' && url.hostname!=='localhost' && url.hostname!=='127.0.0.1')
      return Response.redirect('https://'+url.host+url.pathname+url.search,308);
    if(!env.DATABASE_URL || !env.BUSINESS_DATA_KEY)
      return Response.json({code:'storage_setup',message:'The service owner must configure durable storage.'},{status:503});
    const headers=new Headers(request.headers);
    headers.set('X-Forwarded-Proto',url.protocol.replace(':',''));
    headers.set('X-Forwarded-Host',url.host);
    headers.set('Host',url.host);
    headers.set('X-Forwarded-For',request.headers.get('CF-Connecting-IP') || '127.0.0.1');
    const forwarded=new Request(request,{headers});
    // Never load-balance ephemeral guest records across instances.
    try{return await getContainer(env.LABCLEAR,'labclear-primary').fetch(forwarded);}
    catch{return Response.json({code:'service_starting',message:'The service is starting. Please retry shortly.'},{status:503,headers:{'Retry-After':'10','Cache-Control':'no-store'}});}
  },
  async scheduled(_event: ScheduledController,env: Env,ctx: ExecutionContext): Promise<void> {
    if(env.BUSINESS_WORKER_ENABLED==='true')
      ctx.waitUntil(getContainer(env.LABCLEAR,'labclear-primary').fetch(new Request('http://container/health')).then(r=>r.body?.cancel()));
  }
} satisfies ExportedHandler<Env>;
