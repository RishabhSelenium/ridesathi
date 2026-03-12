from datetime import date
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas

OUTPUT_PATH = Path('output/pdf/throttleup-app-summary.pdf')


def wrapped_lines(text: str, font: str, size: int, max_width: float):
    return simpleSplit(text, font, size, max_width)


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, font: str, size: int, max_width: float, leading: float):
    lines = wrapped_lines(text, font, size, max_width)
    c.setFont(font, size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_section_heading(c: canvas.Canvas, title: str, x: float, y: float):
    c.setFont('Helvetica-Bold', 11)
    c.setFillColorRGB(0.12, 0.24, 0.42)
    c.drawString(x, y, title)
    c.setFillColorRGB(0, 0, 0)
    return y - 14


def draw_bullets(c: canvas.Canvas, bullets: list[str], x: float, y: float, width: float, size: int = 9, leading: float = 11):
    bullet_glyph = '- '
    bullet_indent = 10
    text_width = width - bullet_indent

    for bullet in bullets:
        lines = wrapped_lines(bullet, 'Helvetica', size, text_width)
        if not lines:
            continue
        c.setFont('Helvetica', size)
        c.drawString(x, y, bullet_glyph + lines[0])
        y -= leading
        for line in lines[1:]:
            c.drawString(x + bullet_indent, y, line)
            y -= leading
        y -= 1
    return y


def generate_pdf(output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(output_path), pagesize=LETTER)
    width, height = LETTER
    margin_x = 44
    top_y = height - 42
    content_width = width - (margin_x * 2)

    y = top_y

    c.setFont('Helvetica-Bold', 17)
    c.drawString(margin_x, y, 'ThrottleUpReact App Summary')
    y -= 16

    c.setFont('Helvetica', 8)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.drawString(
        margin_x,
        y,
        f"Repo evidence date: {date.today().isoformat()} | Project: throttleup-react",
    )
    c.setFillColorRGB(0, 0, 0)
    y -= 18

    y = draw_section_heading(c, 'What it is', margin_x, y)
    what_it_is = (
        'ThrottleUpReact is an Expo React Native app (package: throttleup-react) migrated from a web prototype to a mobile-first rider community app. '
        'It combines ride coordination, help posts, chat, groups, and bike news with local AsyncStorage plus Firebase sync.'
    )
    y = draw_wrapped(c, what_it_is, margin_x, y, 'Helvetica', 9, content_width, 11)
    y -= 6

    y = draw_section_heading(c, 'Who it is for', margin_x, y)
    who_for = [
        'Primary persona (explicit): Not found in repo.',
        'Inferred from repo signals (+91 phone flow, India-focused news feeds, Delhi/Gurugram sample data): motorcycle riders in India who coordinate group rides and community support.'
    ]
    y = draw_bullets(c, who_for, margin_x, y, content_width)

    y = draw_section_heading(c, 'What it does', margin_x, y)
    feature_bullets = [
        'Splash and login flow with phone-based auth paths and beta OTP mode.',
        'Feed for ride posts and help posts, with create and detail flows.',
        'My Rides management with participation requests and ride visibility controls.',
        'One-to-one chats and group chats backed by Firebase Realtime Database.',
        'Groups, friend requests, notifications, and profile edit/completion flows.',
        'Live bike news tab from Google News RSS, ranked and refreshed on interval.',
        'Live ride tracking support: participant check-in, location updates, and SOS signal state.'
    ]
    y = draw_bullets(c, feature_bullets, margin_x, y, content_width)

    y = draw_section_heading(c, 'How it works (repo evidence)', margin_x, y)
    arch_bullets = [
        'UI layer: App.tsx orchestrates navigation and app logic; tabs in src/screens/tabs.tsx; modals/components in src/components/.',
        'State layer: src/state/app-state-context.tsx keeps session, theme, feed data, chat data, groups, and modal states in a shared React context.',
        'Local data layer: AsyncStorage keys (throttleup.*) cache theme and app datasets for hydration and offline fallback behavior.',
        'Firebase services: src/firebase/client.ts initializes Auth, Firestore, Realtime DB, Storage, and Functions from EXPO_PUBLIC_* env config.',
        'Service modules: Firestore for users/rides/help/groups and moderation reports; Realtime DB for chats and rideTracking; Storage for photo upload; Functions for ride notifications.',
        'Primary flow: hydrate cached state -> subscribe auth/realtime channels -> fetch Firestore and news -> persist mutations back to Firebase and local cache.',
        'Separate non-Firebase backend service: Not found in repo (README states Firebase is the backend).'
    ]
    y = draw_bullets(c, arch_bullets, margin_x, y, content_width)

    y = draw_section_heading(c, 'How to run (minimal)', margin_x, y)
    run_steps = [
        'Copy env template and set Firebase values: cp .env.example .env',
        'Install dependencies: npm install',
        'Start app: npm run start (then press a for Android emulator or scan QR in Expo Go).',
        'For native phone OTP flow: run npx expo run:android and open the installed dev build (Expo Go does not support this OTP path).'
    ]
    y = draw_bullets(c, run_steps, margin_x, y, content_width)

    if y < 34:
        raise RuntimeError(f'Layout overflowed single page; final y={y:.1f}')

    c.showPage()
    c.save()


if __name__ == '__main__':
    generate_pdf(OUTPUT_PATH)
    print(str(OUTPUT_PATH))
