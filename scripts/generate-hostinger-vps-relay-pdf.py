from __future__ import annotations

from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "celego-hostinger-vps-relay-guia.pdf"


BRAND_BLUE = colors.HexColor("#123A5D")
BRAND_TEAL = colors.HexColor("#1A7F78")
BRAND_GOLD = colors.HexColor("#D99A24")
INK = colors.HexColor("#17212B")
MUTED = colors.HexColor("#5B6773")
LIGHT = colors.HexColor("#EEF4F7")
SOFT_GOLD = colors.HexColor("#FFF4DB")
TABLE_LINE = colors.HexColor("#CED7DF")


class CelegoDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=letter,
            leftMargin=0.72 * inch,
            rightMargin=0.72 * inch,
            topMargin=0.82 * inch,
            bottomMargin=0.72 * inch,
            title="Celego - Guia Hostinger VPS Relay",
            author="Celego / Codex",
            subject="Configuracion segura del VPS Relay DMZ para evidencias",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="normal",
        )
        self.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=self.draw_page)])

    def draw_page(self, canvas, doc):
        canvas.saveState()
        width, height = letter

        if doc.page == 1:
            canvas.setFillColor(BRAND_BLUE)
            canvas.rect(0, height - 2.2 * inch, width, 2.2 * inch, fill=1, stroke=0)
            canvas.setFillColor(BRAND_GOLD)
            canvas.rect(0, height - 2.2 * inch, width, 0.08 * inch, fill=1, stroke=0)
        else:
            canvas.setStrokeColor(TABLE_LINE)
            canvas.line(self.leftMargin, height - 0.55 * inch, width - self.rightMargin, height - 0.55 * inch)
            canvas.setFillColor(MUTED)
            canvas.setFont("Helvetica", 8)
            canvas.drawString(self.leftMargin, height - 0.42 * inch, "Celego Evidencias Seguras - VPS Relay Hostinger")
            canvas.drawRightString(width - self.rightMargin, height - 0.42 * inch, "Fase 1")

        canvas.setStrokeColor(TABLE_LINE)
        canvas.line(self.leftMargin, 0.48 * inch, width - self.rightMargin, 0.48 * inch)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(self.leftMargin, 0.32 * inch, "Documento operativo interno - no contiene secretos")
        canvas.drawRightString(width - self.rightMargin, 0.32 * inch, f"Pagina {doc.page}")
        canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    base.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=base["Title"],
            alignment=TA_CENTER,
            textColor=colors.white,
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=30,
            spaceAfter=14,
        )
    )
    base.add(
        ParagraphStyle(
            name="CoverSubtitle",
            parent=base["Normal"],
            alignment=TA_CENTER,
            textColor=colors.white,
            fontName="Helvetica",
            fontSize=12,
            leading=16,
            spaceAfter=18,
        )
    )
    base.add(
        ParagraphStyle(
            name="H1",
            parent=base["Heading1"],
            textColor=BRAND_BLUE,
            fontName="Helvetica-Bold",
            fontSize=17,
            leading=21,
            spaceBefore=10,
            spaceAfter=8,
            keepWithNext=True,
        )
    )
    base.add(
        ParagraphStyle(
            name="H2",
            parent=base["Heading2"],
            textColor=BRAND_TEAL,
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=15,
            spaceBefore=8,
            spaceAfter=5,
            keepWithNext=True,
        )
    )
    base.add(
        ParagraphStyle(
            name="Body",
            parent=base["BodyText"],
            textColor=INK,
            fontName="Helvetica",
            fontSize=9.5,
            leading=13.2,
            spaceAfter=5.5,
        )
    )
    base.add(
        ParagraphStyle(
            name="Small",
            parent=base["BodyText"],
            textColor=MUTED,
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            spaceAfter=4,
        )
    )
    base.add(
        ParagraphStyle(
            name="Callout",
            parent=base["BodyText"],
            textColor=INK,
            backColor=SOFT_GOLD,
            borderColor=BRAND_GOLD,
            borderWidth=0.8,
            borderPadding=7,
            fontName="Helvetica",
            fontSize=9,
            leading=12.5,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    base.add(
        ParagraphStyle(
            name="CodeBlock",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.2,
            leading=9,
            textColor=colors.HexColor("#111827"),
            backColor=colors.HexColor("#F4F7FA"),
            borderColor=TABLE_LINE,
            borderWidth=0.5,
            borderPadding=5,
            spaceBefore=3,
            spaceAfter=7,
        )
    )
    base.add(
        ParagraphStyle(
            name="TableCell",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.8,
            leading=9.5,
            textColor=INK,
        )
    )
    base.add(
        ParagraphStyle(
            name="TableHead",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.8,
            leading=9.5,
            textColor=colors.white,
            alignment=TA_LEFT,
        )
    )
    return base


S = styles()


def p(text: str, style: str = "Body"):
    return Paragraph(escape(text), S[style])


def h1(title: str):
    return p(title, "H1")


def h2(title: str):
    return p(title, "H2")


def bullets(items: list[str]):
    return ListFlowable(
        [ListItem(p(item, "Body"), leftIndent=12) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=16,
        bulletFontName="Helvetica",
        bulletFontSize=6,
        bulletColor=BRAND_TEAL,
    )


def code(text: str):
    return Preformatted(text.strip("\n"), S["CodeBlock"])


def table(rows: list[list[str]], widths: list[float] | None = None):
    data = []
    for row_index, row in enumerate(rows):
        style = "TableHead" if row_index == 0 else "TableCell"
        data.append([p(cell, style) for cell in row])
    tbl = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("GRID", (0, 0), (-1, -1), 0.35, TABLE_LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ]
        )
    )
    return tbl


def section(title: str, flowables: list, page_break: bool = True):
    story = [h1(title)]
    story.extend(flowables)
    if page_break:
        story.append(PageBreak())
    return story


def build_story():
    story = []

    story.extend(
        [
            Spacer(1, 0.25 * inch),
            p("Celego Evidencias Seguras", "CoverTitle"),
            p("Guia extensa para configurar el VPS Relay en Hostinger", "CoverSubtitle"),
            Spacer(1, 1.05 * inch),
            table(
                [
                    ["Campo", "Valor"],
                    ["Documento", "Configuracion segura del Relay DMZ para evidencias de entrega"],
                    ["Version", "1.0 - Fase 0 y Fase 1"],
                    ["Fecha", date.today().isoformat()],
                    ["Dominio de ejemplo", "relay.celego.example"],
                    ["Estandar reverse proxy", "Caddy con HTTPS automatico"],
                    ["Alcance", "Entregable interno; no configura credenciales reales ni hPanel"],
                ],
                [1.7 * inch, 4.6 * inch],
            ),
            Spacer(1, 0.22 * inch),
            p(
                "Este documento es una guia operativa para TI. No contiene secretos, "
                "no sustituye aprobacion BPD/legal y debe ajustarse con el dominio, "
                "IP administrativa, region y politicas contractuales reales.",
                "Callout",
            ),
            PageBreak(),
        ]
    )

    story.extend(
        section(
            "Indice",
            [
                bullets(
                    [
                        "Resumen ejecutivo y criterios de exito.",
                        "Arquitectura DMZ y frontera de datos.",
                        "Alta del VPS en Hostinger hPanel.",
                        "DNS, hostname y dominio del relay.",
                        "SSH keys, usuario sudo y hardening base.",
                        "Firewall Hostinger, UFW y Fail2ban.",
                        "Docker Compose, Caddy y servicio relay.",
                        "Despliegue desde Git, validacion y pruebas anti-PII.",
                        "Backups, snapshots, monitoreo, rollback e incidentes.",
                        "Anexos con comandos, checklists y fuentes.",
                    ]
                ),
                p(
                    "La guia esta escrita para una primera salida controlada. Las secciones "
                    "pueden convertirse en runbooks separados cuando el equipo de TI tenga "
                    "el dominio real, IPs aprobadas y decision de region.",
                    "Body",
                ),
            ],
        )
    )

    story.extend(
        section(
            "1. Resumen ejecutivo",
            [
                p(
                    "Celego necesita recibir evidencias de entrega desde dispositivos moviles "
                    "sin exponer fotos de cedula, acuses legibles, nombres, direcciones, "
                    "telefonos o datos de tarjeta en un VPS publico. La solucion de Fase 1 "
                    "usa un Relay DMZ en Hostinger que solo transporta blobs cifrados y "
                    "metadata tecnica.",
                ),
                h2("Resultado esperado"),
                bullets(
                    [
                        "El subdominio publico responde por HTTPS con certificado automatico.",
                        "Caddy recibe trafico publico y reenvia internamente al relay.",
                        "El relay no tiene puerto publico directo.",
                        "El relay no posee base core, PII, llave privada maestra ni archivos del portal.",
                        "El firewall Hostinger y UFW permiten solo 80/443 y SSH restringido.",
                        "Los backups/snapshots existen, pero no extienden la retencion del relay.",
                    ]
                ),
                h2("Criterios de listo para piloto"),
                table(
                    [
                        ["Control", "Debe cumplirse"],
                        ["DNS", "A/AAAA del subdominio apunta al VPS"],
                        ["HTTPS", "Caddy emite certificado valido y renueva automaticamente"],
                        ["Healthcheck", "`https://<dominio>/health` responde `200`"],
                        ["Firewall", "SSH solo desde IP aprobada; 80/443 publicos"],
                        ["Datos", "Payload con PII se rechaza antes de persistir"],
                        ["Backups", "Snapshot previo y prueba de restauracion documentada"],
                        ["Legal", "Region y retencion aprobadas por BPD/legal"],
                    ],
                    [1.4 * inch, 4.9 * inch],
                ),
            ],
        )
    )

    story.extend(
        section(
            "2. Arquitectura DMZ",
            [
                p(
                    "La DMZ evita que el celular alcance la red interna. El VPS Relay queda "
                    "expuesto solo para recibir paquetes cifrados. La llave privada que puede "
                    "descifrar evidencias vive en el servidor fisico de Celego, nunca en "
                    "Hostinger.",
                ),
                code(
                    """
App movil corporativa
  -> cifra evidencia con AES-256-GCM
  -> envia blob cifrado + manifiesto tecnico

Internet
  -> HTTPS publico

Caddy en VPS Hostinger
  -> termina TLS
  -> aplica limite de cuerpo y headers
  -> proxy interno

Relay DMZ
  -> valida contrato sin PII
  -> valida hash y tamano
  -> persiste solo metadata tecnica temporal

Servidor fisico Celego
  -> descarga
  -> valida hash
  -> descifra con llave privada
  -> audita y conserva segun contrato
"""
                ),
                h2("Datos permitidos en relay"),
                bullets(
                    [
                        "`deliveryId`, `deviceId`, `objectId`.",
                        "Tipo de evidencia: acuse o cedula.",
                        "Hash SHA-256 del blob cifrado.",
                        "Tamano, estado tecnico, expiracion y timestamps.",
                        "Metadata criptografica publica: algoritmo, IV, tag y llave temporal cifrada.",
                    ]
                ),
                h2("Datos prohibidos en relay"),
                bullets(
                    [
                        "Nombre del cliente.",
                        "Cedula completa en texto.",
                        "Direccion, telefono o tarjeta.",
                        "Foto legible o base64 sin cifrar.",
                        "Llave privada maestra o credenciales core.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "3. Alta del VPS en Hostinger",
            [
                h2("Seleccion recomendada"),
                table(
                    [
                        ["Decision", "Recomendacion"],
                        ["Sistema operativo", "Ubuntu 24.04 LTS o plantilla Docker de Hostinger"],
                        ["Region", "La que apruebe BPD/legal; no asumir pais por conveniencia"],
                        ["Hostname", "`celego-relay-prod-01` o nombre equivalente"],
                        ["Tamanio inicial", "Plan basico suficiente para relay; escalar por volumen real"],
                        ["Acceso", "SSH keys, sin password root"],
                        ["Backups", "Activar backup/snapshot antes de piloto"],
                    ],
                    [1.55 * inch, 4.8 * inch],
                ),
                h2("Pasos en hPanel"),
                bullets(
                    [
                        "Crear VPS o seleccionar el VPS dedicado al relay.",
                        "Elegir Ubuntu 24.04 o Docker template si esta disponible.",
                        "Configurar hostname operativo, no generico.",
                        "Registrar la llave SSH publica del administrador.",
                        "Activar firewall administrado o preparar grupo dedicado.",
                        "Confirmar que backups/snapshots del plan estan disponibles.",
                    ]
                ),
                p(
                    "No guardar contrasenas, tokens, llaves privadas ni `.env` productivos en "
                    "tickets o repositorios. Hostinger hPanel se usa para provisionar y "
                    "recuperar, no como almacen de secretos Celego.",
                    "Callout",
                ),
            ],
        )
    )

    story.extend(
        section(
            "4. DNS, dominio y hostname",
            [
                p(
                    "El dominio publico debe ser un subdominio dedicado. En ejemplos se usa "
                    "`relay.celego.example`; en produccion debe reemplazarse por el dominio "
                    "real aprobado.",
                ),
                h2("Registros DNS"),
                table(
                    [
                        ["Tipo", "Nombre", "Valor"],
                        ["A", "relay", "IPv4 publica del VPS"],
                        ["AAAA", "relay", "IPv6 publica si se habilita"],
                        ["CAA", "opcional", "Permitir autoridad usada por Caddy/ACME si la politica lo exige"],
                    ],
                    [0.7 * inch, 1.2 * inch, 4.4 * inch],
                ),
                h2("Validaciones"),
                code(
                    """
dig relay.celego.example A
dig relay.celego.example AAAA
curl -I http://relay.celego.example/health
curl -I https://relay.celego.example/health
"""
                ),
                p(
                    "Caddy necesita que el DNS resuelva al VPS y que los puertos 80/443 esten "
                    "alcanzables para emitir y renovar certificados.",
                    "Body",
                ),
            ],
        )
    )

    story.extend(
        section(
            "5. SSH keys y usuario sudo",
            [
                h2("Crear usuario operativo"),
                code(
                    """
sudo adduser celego
sudo usermod -aG sudo celego
sudo mkdir -p /home/celego/.ssh
sudo cp ~/.ssh/authorized_keys /home/celego/.ssh/authorized_keys
sudo chown -R celego:celego /home/celego/.ssh
sudo chmod 700 /home/celego/.ssh
sudo chmod 600 /home/celego/.ssh/authorized_keys
"""
                ),
                h2("Deshabilitar password SSH"),
                code(
                    """
sudo nano /etc/ssh/sshd_config

PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes

sudo systemctl reload ssh
"""
                ),
                p(
                    "Antes de cerrar la sesion root o aplicar cambios restrictivos, abrir una "
                    "segunda terminal y validar que el usuario `celego` puede entrar por SSH y "
                    "ejecutar `sudo -v`.",
                    "Callout",
                ),
                h2("Rotacion de llaves"),
                bullets(
                    [
                        "Registrar propietario y fecha de cada llave publica.",
                        "Eliminar llaves de personal que ya no administre el VPS.",
                        "Rotar llave si se expuso en chat, ticket, repo o equipo no confiable.",
                        "Mantener al menos dos administradores aprobados para continuidad.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "6. Hardening Ubuntu",
            [
                h2("Actualizaciones base"),
                code(
                    """
sudo apt update
sudo apt -y upgrade
sudo apt -y install git curl ca-certificates ufw fail2ban
sudo apt -y autoremove
"""
                ),
                h2("Actualizaciones automaticas"),
                code(
                    """
sudo apt -y install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
systemctl status unattended-upgrades --no-pager
"""
                ),
                h2("Fail2ban minimo"),
                code(
                    """
sudo systemctl enable --now fail2ban
sudo fail2ban-client status
sudo fail2ban-client status sshd
"""
                ),
                h2("Principios"),
                bullets(
                    [
                        "No instalar paneles extra si no son necesarios.",
                        "No reutilizar el VPS para portal core, base de datos o archivos internos.",
                        "No dejar scripts con tokens en el home del usuario.",
                        "Documentar cada cambio operacional significativo.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "7. Firewall Hostinger y UFW",
            [
                h2("Reglas publicas"),
                table(
                    [
                        ["Puerto", "Origen", "Destino", "Motivo"],
                        ["80/tcp", "Internet", "Caddy", "ACME HTTP challenge y redireccion"],
                        ["443/tcp", "Internet", "Caddy", "API HTTPS del relay"],
                        ["22/tcp", "IP administrativa", "SSH", "Administracion restringida"],
                        ["3900/tcp", "Ninguno publico", "Relay interno", "Solo red Docker privada"],
                    ],
                    [0.75 * inch, 1.4 * inch, 1.35 * inch, 2.75 * inch],
                ),
                h2("UFW"),
                code(
                    """
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <IP_ADMIN>/32 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
"""
                ),
                p(
                    "Hostinger firewall es la primera capa. UFW es la segunda. Ambas reglas "
                    "deben coincidir; si una abre SSH a internet y la otra lo cierra, queda una "
                    "operacion confusa y dificil de auditar.",
                    "Callout",
                ),
            ],
        )
    )

    story.extend(
        section(
            "8. Docker y compose del relay",
            [
                h2("Instalacion si no se uso template Docker"),
                code(
                    """
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker celego
newgrp docker
docker version
docker compose version
"""
                ),
                h2("Servicios del compose"),
                table(
                    [
                        ["Servicio", "Funcion", "Exposicion"],
                        ["relay", "Valida manifiestos y metadata tecnica", "Solo red Docker interna"],
                        ["caddy", "TLS, headers, proxy y logs HTTP", "Puertos 80/443 del host"],
                        ["relay_metadata", "Metadata temporal sin PII", "Volumen Docker"],
                        ["caddy_data", "Certificados ACME", "Volumen Docker"],
                    ],
                    [1.25 * inch, 3.2 * inch, 1.85 * inch],
                ),
                h2("Comandos base"),
                code(
                    """
docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml build

docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml up -d --force-recreate

docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml ps
"""
                ),
            ],
        )
    )

    story.extend(
        section(
            "9. Caddy con HTTPS automatico",
            [
                p(
                    "Caddy se usa como estandar porque automatiza emision y renovacion HTTPS. "
                    "Esto reduce operacion manual y evita scripts cron para certificados.",
                ),
                h2("Caddyfile esperado"),
                code(
                    """
{
  email {$ACME_EMAIL}
  admin off
}

{$RELAY_DOMAIN} {
  encode zstd gzip
  request_body {
    max_size 18MB
  }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "no-referrer"
    -Server
  }
  reverse_proxy relay:3900
}
"""
                ),
                h2("Validaciones"),
                bullets(
                    [
                        "`curl -I https://<dominio>/health` responde con HTTPS valido.",
                        "No hay certificado autofirmado.",
                        "No se publica `http://<ip>:3900`.",
                        "Logs Caddy no incluyen request bodies.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "10. Variables y secretos",
            [
                h2("Plantilla `.env`"),
                code(
                    """
RELAY_DOMAIN=relay.celego.example
ACME_EMAIL=ti@celego.example
RELAY_PORT=3900
RELAY_METADATA_FILE=/data/metadata.json
COMPOSE_PROJECT_NAME=celego-relay
"""
                ),
                h2("Reglas"),
                bullets(
                    [
                        "El `.env` real vive en el VPS y no se commitea.",
                        "El relay no recibe `DATABASE_URL` del core.",
                        "El relay no recibe `NEXTAUTH_SECRET` ni secretos del portal.",
                        "La llave privada maestra no se copia al VPS.",
                        "Si se agregan tokens de despliegue, deben rotarse y documentarse.",
                    ]
                ),
                p(
                    "Si una variable no es necesaria para transportar blobs cifrados, no debe "
                    "existir en el entorno del relay. Menos secretos significa menos radio de "
                    "explosion si el VPS se compromete.",
                    "Callout",
                ),
            ],
        )
    )

    story.extend(
        section(
            "11. Despliegue desde Git",
            [
                h2("Clonar repo"),
                code(
                    """
sudo mkdir -p /opt/celego
sudo chown celego:celego /opt/celego
cd /opt/celego
git clone <REPO_URL> .
git checkout codex/evidencias-seguras-roadmap
cp infra/hostinger/.env.example infra/hostinger/.env
nano infra/hostinger/.env
"""
                ),
                h2("Actualizar"),
                code(
                    """
cd /opt/celego
git fetch origin
git checkout codex/evidencias-seguras-roadmap
git pull --ff-only
docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml up -d --build --force-recreate
"""
                ),
                h2("Estrategia"),
                bullets(
                    [
                        "Usar `--ff-only` para evitar merges manuales en el VPS.",
                        "Etiquetar commits estables antes de produccion.",
                        "No editar codigo directamente en el VPS.",
                        "Conservar runbook y salida de validacion por despliegue.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "12. Pruebas de validacion",
            [
                h2("Healthcheck"),
                code(
                    """
curl -sS https://relay.celego.example/health
"""
                ),
                h2("Payload con PII debe fallar"),
                code(
                    """
curl -sS -X POST https://relay.celego.example/evidence \\
  -H 'Content-Type: application/json' \\
  -d '{"nombre":"Cliente Prueba","cedula":"00112345678"}'
"""
                ),
                h2("Respuesta esperada"),
                code(
                    """
{
  "error": "relay_payload_contains_pii",
  "path": "nombre",
  "reason": "field_name_contains_sensitive_label"
}
"""
                ),
                h2("Pruebas de repo antes de liberar"),
                code(
                    """
npm run test
npm run lint
npm run build
docker compose build
docker compose up -d --force-recreate
docker compose ps
"""
                ),
            ],
        )
    )

    story.extend(
        section(
            "13. Backups y snapshots",
            [
                p(
                    "El relay no es repositorio historico, pero si requiere capacidad de "
                    "recuperar configuracion, certificados y metadata temporal no vencida.",
                ),
                h2("Politica sugerida"),
                table(
                    [
                        ["Elemento", "Retencion sugerida", "Uso"],
                        ["Snapshot pre-deploy", "7 a 14 dias", "Rollback rapido"],
                        ["Backup Hostinger", "Segun plan", "Recuperacion operacional"],
                        ["relay_metadata", "24 a 72 horas", "Sincronizacion temporal"],
                        ["caddy_data", "Vida del dominio", "Certificados ACME"],
                        ["Logs", "30 a 90 dias sin PII", "Diagnostico y auditoria tecnica"],
                    ],
                    [1.45 * inch, 1.45 * inch, 3.4 * inch],
                ),
                h2("Prueba trimestral"),
                bullets(
                    [
                        "Restaurar snapshot en ventana controlada o VPS temporal.",
                        "Levantar stack con compose.",
                        "Validar healthcheck HTTPS.",
                        "Confirmar que metadata no contiene PII.",
                        "Documentar resultado y destruir entorno temporal.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "14. Monitoreo y logs",
            [
                h2("Indicadores minimos"),
                table(
                    [
                        ["Indicador", "Alerta"],
                        ["`/health` no responde", "Incidente alto si dura mas de ventana operativa"],
                        ["Errores 5xx", "Revisar relay, Caddy y disco"],
                        ["Errores anti-PII", "Revisar app movil o intento invalido"],
                        ["Hash mismatch", "Investigar manipulacion o bug de cliente"],
                        ["Volumen metadata crece", "Revisar limpieza y descargas pendientes"],
                        ["SSH fallidos repetidos", "Validar Fail2ban/firewall"],
                    ],
                    [2.0 * inch, 4.3 * inch],
                ),
                h2("Comandos"),
                code(
                    """
docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml ps

docker logs --tail=200 celego-relay
docker logs --tail=200 celego-relay-caddy
df -h
sudo fail2ban-client status sshd
"""
                ),
            ],
        )
    )

    story.extend(
        section(
            "15. Rollback",
            [
                h2("Rollback por codigo"),
                code(
                    """
cd /opt/celego
git checkout <commit-estable>
docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml up -d --build --force-recreate
curl -sS https://relay.celego.example/health
"""
                ),
                h2("Rollback por infraestructura"),
                bullets(
                    [
                        "Si Caddy falla por certificados, revisar DNS y puertos 80/443.",
                        "Si relay falla por build, volver al commit estable.",
                        "Si VPS queda inconsistente, restaurar snapshot Hostinger.",
                        "Si se sospecha compromiso, no restaurar volumen sin revision de Seguridad.",
                    ]
                ),
                p(
                    "Rollback no debe reintroducir versiones que acepten PII o fotos legibles en "
                    "relay. La seguridad del contrato tiene prioridad sobre recuperar velocidad.",
                    "Callout",
                ),
            ],
        )
    )

    story.extend(
        section(
            "16. Incidentes",
            [
                h2("VPS comprometido"),
                bullets(
                    [
                        "Cerrar SSH a todo origen salvo IP de emergencia.",
                        "Detener stack si existe actividad sospechosa.",
                        "Preservar logs y hashes de archivos modificados.",
                        "Rotar llaves SSH y tokens de despliegue.",
                        "Reconstruir desde snapshot limpio o VPS nuevo.",
                        "Confirmar que no habia PII ni llave privada en el relay.",
                    ]
                ),
                h2("PII detectada en relay"),
                bullets(
                    [
                        "Confirmar si el payload fue rechazado antes de persistir.",
                        "Si se persistio, aislar metadata y notificar a Seguridad.",
                        "Eliminar con aprobacion y registrar evidencia tecnica.",
                        "Crear prueba automatizada para bloquear recurrencia.",
                    ]
                ),
                h2("Dispositivo perdido"),
                bullets(
                    [
                        "Marcar dispositivo `LOST` o `REVOKED`.",
                        "Revocar token/certificado.",
                        "Ejecutar bloqueo o borrado remoto por MDM.",
                        "Identificar rutas y evidencias pendientes.",
                        "Escalar a BPD/legal segun protocolo aprobado.",
                    ]
                ),
            ],
        )
    )

    story.extend(
        section(
            "17. Checklist final de produccion",
            [
                table(
                    [
                        ["Categoria", "Evidencia requerida", "Estado"],
                        ["DNS", "Subdominio resuelve al VPS", "Pendiente"],
                        ["TLS", "Certificado valido en HTTPS", "Pendiente"],
                        ["Firewall", "Hostinger y UFW documentados", "Pendiente"],
                        ["SSH", "Password deshabilitado, IP restringida", "Pendiente"],
                        ["Relay", "`/health` responde 200", "Pendiente"],
                        ["Anti-PII", "Payload sensible rechazado", "Pendiente"],
                        ["Backups", "Snapshot y backup activos", "Pendiente"],
                        ["Restore", "Prueba de restauracion registrada", "Pendiente"],
                        ["Legal", "Region y retencion aprobadas", "Pendiente"],
                        ["Operacion", "Contactos e incidente definidos", "Pendiente"],
                    ],
                    [1.2 * inch, 3.6 * inch, 1.3 * inch],
                ),
                p(
                    "Este checklist debe anexarse al acta de salida. Si un punto queda en "
                    "`Pendiente`, el equipo debe decidir si es bloqueante o si el piloto sera "
                    "solo tecnico sin evidencias reales.",
                    "Callout",
                ),
            ],
        )
    )

    story.extend(
        section(
            "18. Anexo A - Comandos rapidos",
            [
                h2("Operar stack"),
                code(
                    """
cd /opt/celego
docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml ps
docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml logs --tail=200
docker compose --env-file infra/hostinger/.env \\
  -f infra/hostinger/docker-compose.relay.yml restart relay
"""
                ),
                h2("Inspeccionar volumen"),
                code(
                    """
docker volume ls | grep relay
docker exec celego-relay node -e "console.log(process.env.RELAY_METADATA_FILE)"
docker exec celego-relay ls -lah /data
"""
                ),
                h2("Red y puertos"),
                code(
                    """
sudo ss -tulpn
sudo ufw status verbose
curl -sS https://relay.celego.example/health
"""
                ),
            ],
        )
    )

    story.extend(
        section(
            "19. Anexo B - Fuentes",
            [
                bullets(
                    [
                        "Hostinger VPS dashboard: https://www.hostinger.com/support/5726606-how-to-use-the-vps-dashboard-in-hostinger/",
                        "Hostinger SSH keys: https://www.hostinger.com/tutorials/how-to-set-up-ssh-keys",
                        "Hostinger VPS firewall: https://www.hostinger.com/support/8172641-how-to-use-a-managed-vps-firewall-at-hostinger/",
                        "Hostinger Docker on Ubuntu/template: https://www.hostinger.com/tutorials/how-to-install-docker-on-ubuntu",
                        "Hostinger VPS backups/snapshots: https://www.hostinger.com/vps-hosting",
                        "Caddy Automatic HTTPS: https://caddyserver.com/docs/automatic-https",
                        "Ubuntu UFW: https://ubuntu.com/server/docs/how-to/security/firewalls/",
                        "Ubuntu Fail2ban community docs: https://help.ubuntu.com/community/Fail2ban",
                    ]
                ),
                p(
                    "Las fuentes deben revisarse nuevamente antes de ejecutar produccion, "
                    "porque Hostinger puede cambiar pantallas, nombres de menus o funciones "
                    "incluidas por plan.",
                    "Body",
                ),
            ],
            page_break=False,
        )
    )

    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = CelegoDocTemplate(str(OUTPUT))
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
