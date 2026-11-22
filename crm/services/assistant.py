"""Chat over OneFlow data. Gemini picks which tool to run and words the answer; every figure comes from the tools."""
import json
import urllib.error
import urllib.request

from django.conf import settings
from django.utils import timezone

from crm.access import role_of
from crm.errors import BusinessError
from crm.services.assistant_tools import run_tool, tools_for

ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
ROLE_LABELS = {'SALES': 'sales', 'MANAGER': 'manajer', 'WAREHOUSE': 'petugas gudang'}
SUGGESTIONS = {
    'SALES': ['Hari ini saya ke mana?', 'Berapa kunjungan saya yang terlambat?', 'Bagaimana capaian target saya?'],
    'MANAGER': ['Produk dan outlet mana yang melambat?', 'Bagaimana capaian target tim bulan ini?', 'Siapa yang paling banyak kunjungan terlambat?'],
    'WAREHOUSE': ['Produk apa yang stoknya menipis?', 'Berapa pesanan yang menunggu dikirim?'],
}
MAX_STEPS = 4


def enabled():
    return bool(settings.GEMINI_API_KEY)


def _system(actor):
    name = actor.get_full_name() or actor.username
    return (
        f'Kamu asisten OneFlow untuk CV Arbain, distributor madu dan herbal. Pengguna: {name}, {ROLE_LABELS[role_of(actor)]}. '
        f'Hari ini {timezone.localdate():%d-%m-%Y}.\n'
        'Jawab hanya dari hasil fungsi. Jangan mengarang atau menghitung angka yang tidak ada di hasil fungsi. '
        'Tiap hasil punya "cakupan": kalau pengguna menanyakan data di luar cakupan itu (misalnya sales lain), katakan datanya tidak tersedia untuknya dan jangan sajikan data lain sebagai gantinya. '
        'Salin nama outlet dan produk persis seperti di hasil fungsi. '
        'Kalau tidak ada fungsi yang cocok, katakan dengan singkat bahwa datanya tidak tersedia dan sebutkan apa yang bisa ditanyakan. '
        'Kalau fungsi menjawab dengan jumlah 0 atau daftar kosong, itu jawabannya: katakan tidak ada (misalnya "Tidak ada produk yang menipis").\n'
        'Gaya: bahasa Indonesia sehari-hari, singkat, langsung ke jawabannya, tanpa basa-basi dan tanpa menyebut nama fungsi. '
        'Untuk daftar pakai baris berawalan "- ", paling banyak 8 butir, dan di tiap butir sertakan alasan serta angkanya (jumlah unit, hari terlambat, terjual dan dipajang) dari hasil fungsi. Tebalkan nama outlet atau produk dengan **. Rupiah ditulis seperti Rp 12,5 juta. '
        'Nama outlet dan produk ditulis dengan huruf kapital di awal kata.'
    )


def _call(body):
    request = urllib.request.Request(
        ENDPOINT.format(model=settings.GEMINI_MODEL), data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json', 'x-goog-api-key': settings.GEMINI_API_KEY},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise BusinessError('ASSISTANT_UNAVAILABLE', 'Asisten sedang tidak bisa dihubungi. Coba lagi sebentar.') from error


def ask(actor, question, history=()):
    """Answer one question. `history` is earlier turns as {'role': 'user'|'model', 'text': str}."""
    if not enabled():
        raise BusinessError('ASSISTANT_UNAVAILABLE', 'Asisten belum diaktifkan.')
    declarations = [{'name': name, 'description': spec[2], **({'parameters': {'type': 'object', 'properties': spec[3]}} if spec[3] else {})}
                    for name, spec in tools_for(actor).items()]
    contents = [{'role': turn['role'], 'parts': [{'text': turn['text']}]} for turn in history]
    contents.append({'role': 'user', 'parts': [{'text': question}]})
    body = {
        'systemInstruction': {'parts': [{'text': _system(actor)}]}, 'contents': contents,
        'tools': [{'functionDeclarations': declarations}], 'generationConfig': {'temperature': 0},
    }
    sources = []
    for _ in range(MAX_STEPS):
        candidates = _call(body).get('candidates') or [{}]
        content = candidates[0].get('content') or {}
        parts = content.get('parts') or []
        calls = [part['functionCall'] for part in parts if 'functionCall' in part]
        if not calls:
            text = ''.join(part.get('text', '') for part in parts if not part.get('thought')).strip()
            if not text:
                break
            return {'answer': text, 'sources': sources}
        contents.append(content)
        replies = []
        for call in calls:
            data, links = run_tool(actor, call.get('name', ''), call.get('args'))
            sources += [link for link in links if link not in sources]
            reply = {'name': call.get('name', ''), 'response': {'result': data}}
            if call.get('id'):
                reply['id'] = call['id']
            replies.append({'functionResponse': reply})
        contents.append({'role': 'user', 'parts': replies})
    raise BusinessError('ASSISTANT_UNAVAILABLE', 'Asisten tidak bisa menjawab pertanyaan itu. Coba tanyakan dengan cara lain.')
