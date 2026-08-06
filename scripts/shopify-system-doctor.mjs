#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const checks = [];
function check(name, pass, detail = null) { checks.push({ name, pass, detail }); }
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function exists(relative) { return fs.existsSync(path.join(root, relative)); }
try {
  check('AGENTS.md exists', exists('AGENTS.md'));
  const agents = exists('AGENTS.md') ? read('AGENTS.md') : '';
  check('AGENTS does not force MARKETING_RUNBOOK for Shopify tasks', !agents.includes('MARKETING_RUNBOOK'));
  check('AGENTS does not force audit:kryo-source-health for Shopify tasks', !agents.includes('audit:kryo-source-health'));
  check('AGENTS does not reference --handle kryo2_', !agents.includes('--handle kryo2_'));
  const packageJson = JSON.parse(read('package.json'));
  check('package has shopify:doctor', Boolean(packageJson.scripts?.['shopify:doctor']));
  check('package has shopify:ops', Boolean(packageJson.scripts?.['shopify:ops']));
  for (const file of ['config/shopify-surfaces.json', 'config/shopify-ops-policy.json', 'schemas/shopify-operation.schema.json', 'scripts/shopify-ops.mjs']) check(`${file} exists`, exists(file));
  const codexConfig = exists('.codex/config.toml') ? read('.codex/config.toml') : '';
  check('no meta-ads-pipeboard config', !codexConfig.includes('meta-ads-pipeboard'));
  const growthSkill = path.join(os.homedir(), '.codex/skills/kryo-growth-team');
  const growthSkillDisabled = fs.existsSync(path.join(growthSkill, '.disabled'));
  check('local kryo-growth-team skill is absent or disabled', !fs.existsSync(growthSkill) || growthSkillDisabled, fs.existsSync(growthSkill) ? (growthSkillDisabled ? 'disabled' : 'active') : 'absent');
  const ops = exists('scripts/shopify-ops.mjs') ? read('scripts/shopify-ops.mjs') : '';
  check('ops has no shopify theme push', !ops.includes('shopify theme push'));
  check('ops has no shopify theme pull', !ops.includes('shopify theme pull'));
  check('ops has no @Shopify decorator', !ops.includes('@Shopify'));
  check('ops has no clone-template outside blocked branch', !ops.includes('clone-template'));
} catch (error) { check('doctor execution', false, error instanceof Error ? error.message : String(error)); }
const blocked = checks.filter((item) => !item.pass);
process.stdout.write(`${JSON.stringify({ status: blocked.length ? 'SHOPIFY_OPS_SYSTEM_BLOCKED' : 'SHOPIFY_OPS_SYSTEM_READY', checks, blocked: blocked.map((item) => item.name) })}\n`);
