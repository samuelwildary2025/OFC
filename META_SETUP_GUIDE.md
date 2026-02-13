# Guia de Configuração Meta (WhatsApp Cloud API)

Para usar este sistema como um facilitador de campanhas, você precisa configurar um Aplicativo na Meta (Facebook).

## 1. Criar App na Meta

1. Acesse [developers.facebook.com](https://developers.facebook.com/).
2. Vá em **Meus Apps** -> **Criar App**.
3. Selecione **Outro** -> **Empresa** (Business).
4. Dê um nome ao App (ex: "Disparador Marketing") e vincule à sua Conta Empresarial.

## 2. Adicionar WhatsApp

1. No painel do App, procure por **WhatsApp** e clique em **Configurar**.
2. Selecione sua conta empresarial.

## 3. Obter Credenciais Permanentes

O token temporário dura apenas 24h. Para produção, você precisa de um token permanente.

1. Vá em **Configurações do Negócio** (Business Settings) no Gerenciador de Negócios.
2. Menu Lateral: **Usuários** -> **Usuários do Sistema**.
3. Clique em **Adicionar**, dê um nome (ex: "API Bot") e função **Administrador**.
4. Clique em **Gerar Novo Token**.
   - Selecione o App que você criou.
   - Validade: **Permanente** (ou 60 dias).
   - Permissões (Marque estas):
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
5. **Copie esse Token**. Esse é o seu **Access Token**.

## 4. Configurar Webhook (Para receber respostas)

1. No painel do seu App (developers.facebook.com), menu lateral: **WhatsApp** -> **Configuração**.
2. Encontre a seção **Webhook** e clique em **Editar**.
3. **URL de Retorno (Callback URL):**
   - Se usar domínio: `https://api.seudominio.com/webhook`
   - Se usar IP (não recomendado): `http://31.97.252.6:3000/webhook` (precisa ser HTTPS para a Meta aceitar, então use Cloudflare ou domínio no Easypanel).
4. **Token de Verificação:**
   - Coloque o token que está no seu `.env` (Padrão: `admin-secret-token`).
5. Clique em **Verificar e Salvar**.
6. Em **Campos de Webhook**, clique em **Gerenciar** e assine:
   - `messages`
   - `message_template_status_update` (opcional)

## 5. Cadastrar no Sistema

1. Abra o painel do seu sistema (`/dashboard`).
2. Vá em **Instâncias**.
3. Na configuração, insira:
   - **Phone Number ID**: (Disponível na tela de configuração do WhatsApp no painel da Meta).
   - **Access Token**: (O token permanente que você gerou no passo 3).
4. Salve! 🎉

## Dicas Importantes

- **Templates:** Para iniciar conversa com quem não falou com você nas últimas 24h, você **TEM** que usar Templates aprovados pela Meta.
- **Limites:** O WhatsApp tem limites de envio (1k, 10k, 100k conversas/dia). Aumente conforme usa e não é bloqueado.

## Provedor de Tecnologia (Tech Provider)

Se você atua como **Provedor de Tecnologia** (ISV) gerenciando contas de clientes:

1.  **Modelo de Negócio:**
    - Você fornece o sistema (SaaS).
    - O **Cliente Final** é dono da conta do WhatsApp (WABA) e paga as conversas diretamente para a Meta.

2.  **Fluxo de Onboarding (Embedded Signup/COEX):**
    - O seu App (criado acima) deve ser do tipo "Empresa" e ter o produto "Login do Facebook para Empresas".
    - O **Cliente** clica em "Conectar com Facebook" no seu painel.
    - O **Cliente** faz login na conta PESSOAL dele do Facebook.
    - O **Cliente** seleciona/cria a WABA dele e concede permissão ao SEU App.
    - O sistema recebe um token para gerenciar a WABA dele *em nome dele*.

**Importante:** Você **NÃO** deve pedir a senha do Facebook do seu cliente. O fluxo seguro (COEX) permite que ele conceda acesso sem compartilhar credenciais.
