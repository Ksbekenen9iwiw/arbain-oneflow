"""Allowlisted workspace return links; never redirect to mutation or external URLs."""
import re
from urllib.parse import urlsplit, parse_qs

WORKSPACE = re.compile(r"/(?:customers/|orders/|stock/|(?:customers|orders|products)/[1-9][0-9]{0,17}/)?$")

def safe_return(value, fallback, depth=0):
    if not value or len(value) > 4096 or depth > 5:
        return fallback
    try:
        url = urlsplit(value)
        if (url.scheme or url.netloc or url.fragment or "\\" in value
                or any(ord(c) < 32 or ord(c) == 127 for c in value)
                or not WORKSPACE.fullmatch(url.path)):
            return fallback
        nested = parse_qs(url.query).get('return_to', [])
        if any(safe_return(item, '', depth + 1) != item for item in nested):
            return fallback
        return value
    except ValueError:
        return fallback


def return_url(request, fallback):
    return safe_return(request.GET.get('return_to', ''), fallback)
