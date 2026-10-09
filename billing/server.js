import express from 'express';
import Stripe from 'stripe';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const required=['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_ID','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PUBLIC_SITE_URL'];
const missing=required.filter(k=>!process.env[k]);
if(missing.length) throw Error('Missing required server configuration: '+missing.join(', '));
const origin=new URL(process.env.PUBLIC_SITE_URL).origin;
if(!origin.startsWith('https://') && !origin.startsWith('http://localhost')) throw Error('PUBLIC_SITE_URL must be HTTPS');
const supabase=new URL(process.env.SUPABASE_URL);
if(supabase.protocol!=='https:') throw Error('SUPABASE_URL must be HTTPS');
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
const jwks=createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json',supabase));
const app=express();app.disable('x-powered-by');app.use(helmet());
app.use((req,res,next)=>{res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next()});
app.use(rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}));

async function db(path,method='GET',body){
 const response=await fetch(new URL('/rest/v1/'+path,supabase),{method,headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
 if(!response.ok) throw Error('Database request failed: '+response.status);
 return response.json();
}
async function authenticate(req,res,next){
 try{
  const token=/^Bearer (.+)$/.exec(req.headers.authorization||'')?.[1];
  if(!token)return res.sendStatus(401);
  const {payload}=await jwtVerify(token,jwks,{issuer:new URL('/auth/v1',supabase).toString(),audience:'authenticated'});
  if(!payload.sub||!/^[-a-f0-9]{36}$/i.test(payload.sub))return res.sendStatus(401);
  req.userId=payload.sub;next();
 }catch{return res.sendStatus(401)}
}
async function subscription(userId){const rows=await db('pro_subscriptions?user_id=eq.'+encodeURIComponent(userId)+'&select=*');return rows[0]||null}
async function upsert(record){await db('pro_subscriptions?on_conflict=user_id','POST',record)}
function safe(handler){return (req,res,next)=>Promise.resolve(handler(req,res)).catch(next)}
app.post('/stripe/webhook',express.raw({type:'application/json',limit:'128kb'}),safe(async(req,res)=>{
 let event;
 try{event=stripe.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET)}catch{return res.status(400).send('Invalid webhook signature')}
 if(event.type==='checkout.session.completed'){
  const session=event.data.object;
  if(session.mode==='subscription'&&session.client_reference_id&&session.subscription&&session.customer){
   const sub=await stripe.subscriptions.retrieve(session.subscription);
   await upsert({user_id:session.client_reference_id,stripe_customer_id:String(session.customer),stripe_subscription_id:String(sub.id),status:sub.status,updated_at:new Date().toISOString()});
  }
 }
 if(['customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
  const sub=event.data.object;
  const rows=await db('pro_subscriptions?stripe_subscription_id=eq.'+encodeURIComponent(sub.id)+'&select=user_id');
  if(rows[0])await upsert({user_id:rows[0].user_id,stripe_customer_id:String(sub.customer),stripe_subscription_id:sub.id,status:sub.status,updated_at:new Date().toISOString()});
 }
 res.json({received:true});
}));
app.use(express.json({limit:'8kb'}));
app.get('/health',(_req,res)=>res.json({ok:true,service:'WiFiShield Pro billing API'}));
app.get('/pro/status',authenticate,safe(async(req,res)=>{
 const sub=await subscription(req.userId);
 res.json({active:sub?.status==='active'||sub?.status==='trialing',status:sub?.status||'inactive'});
}));
app.post('/pro/checkout',authenticate,safe(async(req,res)=>{
 const existing=await subscription(req.userId);
 if(existing?.status==='active'||existing?.status==='trialing')return res.status(409).json({error:'Subscription already active'});
 const session=await stripe.checkout.sessions.create({
  mode:'subscription',line_items:[{price:process.env.STRIPE_PRICE_ID,quantity:1}],
  client_reference_id:req.userId,
  ...(existing?.stripe_customer_id?{customer:existing.stripe_customer_id}:{}),
  success_url:origin+'/?checkout=success',cancel_url:origin+'/?checkout=cancel',
  allow_promotion_codes:false
 });
 res.json({url:session.url});
}));
app.post('/pro/portal',authenticate,safe(async(req,res)=>{
 const sub=await subscription(req.userId);
 if(!sub?.stripe_customer_id)return res.status(404).json({error:'No billing account'});
 const portal=await stripe.billingPortal.sessions.create({customer:sub.stripe_customer_id,return_url:origin+'/'});
 res.json({url:portal.url});
}));
app.use((err,_req,res,_next)=>{console.error('Request failed:',err.message);res.status(500).json({error:'Service temporarily unavailable'})});
app.listen(Number(process.env.PORT||3000),()=>console.log('WiFiShield billing API listening'));
