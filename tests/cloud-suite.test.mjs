import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { quickPlans, CloudSuite } from '../src/cloud-suite.mjs';

const allowedOrigins = ['https://admin.example.com','https://app.example.com','https://mobile.example.com'];

test('quick start only asks for admin and client URLs; produces desktop + mobile plans', () => {
  const plans = quickPlans({
    adminUrl:'https://admin.example.com/admin',
    clientUrls:'https://app.example.com/\nhttps://mobile.example.com/onboarding',
  }, allowedOrigins);
  assert.equal(plans.length, 3);
  assert.deepEqual(plans.map(x => x.plan.device), ['desktop','mobile','mobile']);
  assert.equal(plans[0].plan.steps[0].path, '/admin');
  assert.equal(plans[2].plan.steps[0].path, '/onboarding');
  assert.deepEqual(plans[1].plan.steps.map(x => x.action), ['goto','assertVisible']);
});

test('quick plan rejects missing URLs, unsafe hosts, unapproved origins and duplicates', () => {
  assert.throws(() => quickPlans({adminUrl:'https://admin.example.com',clientUrls:''}, allowedOrigins), /1–8/);
  assert.throws(() => quickPlans({adminUrl:'https://admin.example.com',clientUrls:'https://admin.example.com'}, allowedOrigins), /重複/);
  assert.throws(() => quickPlans({adminUrl:'https://admin.example.com',clientUrls:'https://evil.example.com'}, allowedOrigins), /允許/);
  assert.throws(() => quickPlans({adminUrl:'https://127.0.0.1',clientUrls:'https://app.example.com'}, allowedOrigins), /禁止/);
  assert.throws(() => quickPlans({adminUrl:'https://admin.example.com',clientUrls:'http://localhost:3000'}, allowedOrigins), /HTTPS/);
});

test('multi-target quick suite runs targets serially, with separated remote sessions', async () => {
  let active = 0;
  let peak = 0;
  let starts = 0;
  class FakeEngine extends EventEmitter {
    constructor() { super(); this.state='idle'; this.results=[]; }
    status() { return { state:this.state, results:this.results, pauseReason:null }; }
    async start(plan) {
      active++; starts++; peak = Math.max(peak, active);
      this.state='running';
      this.running = new Promise(ok => setTimeout(() => {
        this.results=[{ name:'首頁可見',status:'passed' }];
        this.state='completed';
        this.emit('update',{at:new Date().toISOString(),type:'pass',message:'首頁可見'});
        active--;ok();
      }, 10));
      return this.status();
    }
    async stop() { this.state='stopped'; }
    preview() { return null; }
  }
  const suite = new CloudSuite({ allowedOrigins, engineFactory: () => new FakeEngine() });
  await suite.start({ adminUrl:'https://admin.example.com', clientUrls:'https://app.example.com\nhttps://mobile.example.com' });
  await suite.worker;
  assert.equal(suite.status().state, 'completed');
  assert.equal(starts, 3);
  assert.equal(peak, 1);
  assert.deepEqual(suite.status().results.map(x => x.target), ['管理端','用戶端 1','用戶端 2']);
});
