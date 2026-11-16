"""Shared view rendering helper."""


def page(request, template, context=None, status=200):
    from crm.frontend import render_page
    return render_page(request, template, context, status)
