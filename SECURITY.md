# Security Policy

## 支持范围

安全修复以默认分支的最新版本为准。历史提交和自行修改的部署版本不保证继续维护。

## 报告漏洞

请优先使用 GitHub 仓库的 **Security → Report a vulnerability** 私密报告功能。不要在公开 Issue、讨论区、截图或日志中提交：

- JWT、数据库密码、云服务密钥或 Bot Token；
- B站 Cookie、refresh token 或二维码登录结果；
- 用户邮箱、电话、地址、订单或积分明细；
- 可直接复现生产环境破坏的完整利用代码。

报告建议包含受影响版本、入口、必要前置条件、实际影响、最小复现和修复建议。维护者会尽力确认、修复并在适当时间协调公开披露。

## 安全边界

- `.env`、数据库、上传目录、日志和备份不应进入 Git。
- 生产启动要求强 JWT 和明确 CORS；代理信任必须与实际网络拓扑一致。
- 管理页面不是安全边界，所有写接口由后端认证和权限中间件保护。
- 公开写接口有请求限制，但部署方仍应配置反向代理、防火墙、日志告警和备份。
- Captcha、邮件与 bili-bot 留空时关闭，不应为了“通过启动”填写假的生产密钥。
- 本仓库不会持久化 B站扫码 Cookie；若修改此行为，必须先完成独立安全评审。

## 发布前密钥检查

```bash
git grep -n -I -E "BEGIN .*PRIVATE KEY|AKIA[0-9A-Z]{16}|JWT_SECRET=.*[^_]"
npm audit --prefix backend --omit=dev
npm audit --prefix frontend --omit=dev
```

建议再使用 GitHub Secret Scanning、Gitleaks 或同类工具扫描完整提交历史。任何曾进入 Git 历史、终端共享输出或公开日志的凭证都应轮换，而不是只删除当前文件。
