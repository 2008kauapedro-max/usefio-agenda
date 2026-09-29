$ErrorActionPreference = "Stop"
$Scope = "pedrokauaps2815-1742s-projects"
$Project = "fio-marketing"

function Parar-Se-Falhar {
    param([string]$Etapa)
    if ($LASTEXITCODE -ne 0) {
        throw "Falhou em: $Etapa. Pare aqui e envie o erro."
    }
}

function Testar-ComandoSilencioso {
    param([string]$Comando)
    & cmd.exe /d /s /c "$Comando >nul 2>nul"
    return $LASTEXITCODE
}

Set-Location $PSScriptRoot

Write-Host "" 
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      PUBLICAR SITE OFICIAL DO FIO" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/5] Instalando dependencias..." -ForegroundColor Cyan
npm ci
Parar-Se-Falhar "npm ci"

Write-Host "[2/5] Conferindo TypeScript..." -ForegroundColor Cyan
npm run typecheck
Parar-Se-Falhar "typecheck"

Write-Host "[3/5] Gerando build..." -ForegroundColor Cyan
npm run build
Parar-Se-Falhar "build"

Write-Host "[4/5] Conferindo login da Vercel..." -ForegroundColor Cyan
$Whoami = Testar-ComandoSilencioso "npx --yes vercel@61.0.0 whoami"
if ($Whoami -ne 0) {
    npx --yes vercel@61.0.0 login
    Parar-Se-Falhar "login da Vercel"
}

# Cria o projeto se ainda nao existir. Se ja existir, o retorno e ignorado.
& cmd.exe /d /s /c "npx --yes vercel@61.0.0 project add $Project --scope $Scope >nul 2>nul"

npx --yes vercel@61.0.0 link --yes --project $Project --scope $Scope
Parar-Se-Falhar "vincular projeto fio-marketing"

Write-Host "[5/5] Publicando em producao..." -ForegroundColor Cyan
npx --yes vercel@61.0.0 --prod --scope $Scope
Parar-Se-Falhar "deploy de producao"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host " SITE DO FIO PUBLICADO COM SUCESSO" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "O app continua em: https://usefio.vercel.app" -ForegroundColor White
Write-Host "Quando usefio.com.br estiver registrado, conecte-o ao projeto fio-marketing." -ForegroundColor Yellow
Write-Host "Depois conecte app.usefio.com.br ao projeto fio e troque VITE_FIO_APP_URL." -ForegroundColor Yellow
Write-Host ""
Read-Host "Pressione ENTER para fechar"
