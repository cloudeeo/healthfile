#!/usr/bin/env python3
"""Synthetic corpus for HealthFile: a fictional family, two years of
documents, rendered as PDFs and as phone-like photos, with ground truth.

Everything here is invented: names, issuers, addresses, values. The values
follow plausible ranges and slow trends so charts tell a story. Nothing is
taken from any real person or institution.

Usage: python3 scripts/make_corpus.py [--out corpus] [--seed 7]
"""

import argparse
import json
import math
import os
import random
import shutil
import subprocess
from datetime import date, timedelta

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("Sans", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("SansB", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", f"{FONT_DIR}/DejaVuSansMono.ttf"))

W, H = A4

# The family (all fictional) -------------------------------------------------

FAMILY = {
    "surname": "Bellandi",
    "people": [
        {"id": "marco", "name": "Marco Bellandi", "born": "1979-03-14", "sex": "M"},
        {"id": "giulia", "name": "Giulia Ferrante", "born": "1982-11-02", "sex": "F"},
        {"id": "tommaso", "name": "Tommaso Bellandi", "born": "2014-06-21", "sex": "M"},
        {"id": "nonna", "name": "Adele Ferrante", "born": "1951-08-30", "sex": "F"},
    ],
}

ISSUERS = {
    "lab": {"name": "Laboratorio Analisi Demo SA", "addr": "Via degli Esempi 12, 6900 Lugano", "tel": "091 000 00 00"},
    "lab_fr": {"name": "Laboratoire Exemple SA", "addr": "Rue de la Démonstration 4, 1200 Genève", "tel": "022 000 00 00"},
    "ped": {"name": "Studio Pediatrico Esempio", "addr": "Piazza Immaginaria 3, 6500 Bellinzona", "tel": "091 000 00 01"},
    "gp": {"name": "Dr.ssa Elena Prova, medicina generale", "addr": "Via Fittizia 8, 6900 Lugano", "tel": "091 000 00 02"},
    "cardio": {"name": "Centro Cardiologico Dimostrativo", "addr": "Viale Campione 21, 6900 Lugano", "tel": "091 000 00 03"},
    "radio": {"name": "Istituto di Radiologia Esempio", "addr": "Via Modello 5, 6900 Lugano", "tel": "091 000 00 04"},
    "pharm": {"name": "Farmacia Esemplare", "addr": "Corso Campione 1, 6900 Lugano", "tel": "091 000 00 05"},
    "ins": {"name": "Assicura Demo SA", "addr": "Casella postale 999, 8000 Zurigo", "tel": "0800 000 000"},
    "hosp": {"name": "Ospedale Regionale Immaginario", "addr": "Via dell'Esempio 100, 6900 Lugano", "tel": "091 000 00 06"},
}

# Analytes: name as printed (it), unit, reference, baseline by person, drift per year
PANELS = {
    "emocromo": [
        ("Emoglobina", "g/dL", (13.5, 17.5), (12.0, 16.0), 15.1, 13.4, 0.0),
        ("Ematocrito", "%", (40, 52), (36, 46), 45.0, 40.0, 0.0),
        ("Eritrociti", "10^6/µL", (4.5, 5.9), (4.0, 5.2), 5.0, 4.5, 0.0),
        ("Leucociti", "10^3/µL", (4.0, 10.0), (4.0, 10.0), 6.2, 6.8, 0.0),
        ("Piastrine", "10^3/µL", (150, 400), (150, 400), 240, 265, 0.0),
        ("MCV", "fL", (80, 99), (80, 99), 89, 88, 0.0),
    ],
    "lipidi": [
        ("Colesterolo totale", "mg/dL", (None, 200), (None, 200), 215, 185, 6.0),
        ("Colesterolo HDL", "mg/dL", (40, None), (50, None), 48, 62, -1.0),
        ("Colesterolo LDL", "mg/dL", (None, 130), (None, 130), 142, 105, 5.0),
        ("Trigliceridi", "mg/dL", (None, 150), (None, 150), 160, 95, 8.0),
    ],
    "metabolico": [
        ("Glicemia", "mg/dL", (70, 99), (70, 99), 96, 88, 2.5),
        ("Emoglobina glicata (HbA1c)", "%", (4.0, 5.6), (4.0, 5.6), 5.5, 5.2, 0.15),
        ("Creatinina", "mg/dL", (0.7, 1.2), (0.5, 1.0), 0.95, 0.72, 0.0),
        ("Acido urico", "mg/dL", (3.5, 7.2), (2.6, 6.0), 6.1, 4.2, 0.1),
        ("ALT (GPT)", "U/L", (None, 41), (None, 33), 34, 21, 1.0),
        ("AST (GOT)", "U/L", (None, 40), (None, 32), 28, 20, 0.0),
        ("Gamma GT", "U/L", (None, 60), (None, 40), 38, 19, 1.5),
    ],
    "tiroide": [
        ("TSH", "mU/L", (0.4, 4.0), (0.4, 4.0), 2.1, 3.1, 0.0),
        ("FT4", "pmol/L", (12, 22), (12, 22), 15.5, 14.2, 0.0),
    ],
    "ferro": [
        ("Ferritina", "ng/mL", (30, 400), (15, 150), 95, 22, 0.0),
        ("Sideremia", "µg/dL", (60, 160), (50, 150), 98, 58, 0.0),
        ("Vitamina D (25-OH)", "ng/mL", (30, 100), (30, 100), 24, 27, 0.0),
    ],
}

FR_NAMES = {
    "Emoglobina": "Hémoglobine", "Ematocrito": "Hématocrite", "Eritrociti": "Érythrocytes", "Leucociti": "Leucocytes",
    "Piastrine": "Plaquettes", "MCV": "VGM", "Colesterolo totale": "Cholestérol total", "Colesterolo HDL": "Cholestérol HDL",
    "Colesterolo LDL": "Cholestérol LDL", "Trigliceridi": "Triglycérides", "Glicemia": "Glycémie", "Emoglobina glicata (HbA1c)": "Hémoglobine glyquée (HbA1c)",
    "Creatinina": "Créatinine", "Acido urico": "Acide urique", "ALT (GPT)": "ALAT", "AST (GOT)": "ASAT", "Gamma GT": "Gamma-GT",
    "TSH": "TSH", "FT4": "T4 libre", "Ferritina": "Ferritine", "Sideremia": "Fer sérique", "Vitamina D (25-OH)": "Vitamine D (25-OH)",
}


def fmt(v, unit):
    if unit in ("10^3/µL", "mg/dL", "U/L", "ng/mL", "µg/dL") and v >= 10:
        return str(int(round(v)))
    return f"{v:.1f}".replace(".", ",") if unit != "fL" else str(int(round(v)))


def ref_text(lo, hi):
    if lo is None:
        return f"< {hi}"
    if hi is None:
        return f"> {lo}"
    return f"{lo} - {hi}"


def draw_header(c, issuer, title, extra=None):
    c.setFont("SansB", 13)
    c.drawString(20 * mm, H - 20 * mm, issuer["name"])
    c.setFont("Sans", 8.5)
    c.drawString(20 * mm, H - 25 * mm, issuer["addr"] + "  ·  Tel. " + issuer["tel"])
    c.setStrokeColorRGB(0.3, 0.3, 0.3)
    c.line(20 * mm, H - 28 * mm, W - 20 * mm, H - 28 * mm)
    c.setFont("SansB", 15)
    c.drawString(20 * mm, H - 40 * mm, title)
    if extra:
        c.setFont("Sans", 9.5)
        y = H - 47 * mm
        for line in extra:
            c.drawString(20 * mm, y, line)
            y -= 5 * mm
        return y - 3 * mm
    return H - 50 * mm


def footer(c, text):
    c.setFont("Sans", 7.5)
    c.setFillColorRGB(0.35, 0.35, 0.35)
    c.drawString(20 * mm, 12 * mm, text)
    c.setFillColorRGB(0, 0, 0)


def it_date(d):
    return d.strftime("%d.%m.%Y")


# Document makers -------------------------------------------------------------

def lab_report(path, person, d, panels, rng, years_from_start, lang="it"):
    issuer = ISSUERS["lab_fr" if lang == "fr" else "lab"]
    values = []
    rows = []
    for key in panels:
        for name, unit, ref_m, ref_f, base_m, base_f, drift in PANELS[key]:
            ref = ref_m if person["sex"] == "M" else ref_f
            base = base_m if person["sex"] == "M" else base_f
            if person["id"] == "tommaso":
                base = base * 0.95 if unit != "%" else base
            if person["id"] == "nonna":
                base = base * 1.05
            v = base + drift * years_from_start + rng.gauss(0, abs(base) * 0.04 + 0.01)
            v = max(0.1, v)
            lo, hi = ref
            flag = "H" if hi is not None and v > hi else ("L" if lo is not None and v < lo else None)
            text = fmt(v, unit)
            printed_name = FR_NAMES.get(name, name) if lang == "fr" else name
            rows.append((key, printed_name, text, unit, ref_text(lo, hi), flag))
            values.append({"name": printed_name, "value": text, "unit": unit, "reference": ref_text(lo, hi), "flag": flag, "number": float(text.replace(",", ".")), "panel": key})
    c = canvas.Canvas(path, pagesize=A4)
    title = "Rapport d'analyses" if lang == "fr" else "Referto esami di laboratorio"
    labels = {
        "it": ["Paziente", "Nato/a il", "Data prelievo", "Medico richiedente", "Esame", "Risultato", "Unità", "Valori di riferimento"],
        "fr": ["Patient", "Né(e) le", "Date du prélèvement", "Médecin prescripteur", "Analyse", "Résultat", "Unité", "Valeurs de référence"],
    }[lang]
    extra = [f"{labels[0]}: {person['name']}", f"{labels[1]}: {it_date(date.fromisoformat(person['born']))}", f"{labels[2]}: {it_date(d)}", f"{labels[3]}: {ISSUERS['gp']['name']}"]
    y = draw_header(c, issuer, title, extra)
    c.setFont("SansB", 9)
    cols = [20 * mm, 95 * mm, 120 * mm, 145 * mm]
    for x, t in zip(cols, labels[4:]):
        c.drawString(x, y, t)
    y -= 2 * mm
    c.line(20 * mm, y, W - 20 * mm, y)
    y -= 5 * mm
    last_panel = None
    panel_titles = {"emocromo": "EMOCROMO", "lipidi": "PROFILO LIPIDICO", "metabolico": "CHIMICA CLINICA", "tiroide": "FUNZIONE TIROIDEA", "ferro": "METABOLISMO DEL FERRO E VITAMINE"}
    if lang == "fr":
        panel_titles = {"emocromo": "HÉMOGRAMME", "lipidi": "BILAN LIPIDIQUE", "metabolico": "CHIMIE CLINIQUE", "tiroide": "FONCTION THYROÏDIENNE", "ferro": "FER ET VITAMINES"}
    for key, name, text, unit, ref, flag in rows:
        if key != last_panel:
            c.setFont("SansB", 8.5)
            c.drawString(20 * mm, y, panel_titles[key])
            y -= 5 * mm
            last_panel = key
        c.setFont("Sans", 9)
        c.drawString(22 * mm, y, name)
        c.setFont("Mono", 9)
        c.drawRightString(112 * mm, y, text + ("  *" if flag else ""))
        c.setFont("Sans", 9)
        c.drawString(120 * mm, y, unit)
        c.drawString(145 * mm, y, ref)
        if flag:
            c.setFont("SansB", 9)
            c.drawString(185 * mm, y, flag)
        y -= 5.2 * mm
        if y < 30 * mm:
            footer(c, "* valore fuori dall'intervallo di riferimento" if lang == "it" else "* valeur hors des limites de référence")
            c.showPage()
            y = H - 25 * mm
    footer(c, ("* valore fuori dall'intervallo di riferimento · Referto validato elettronicamente · Documento fittizio a scopo dimostrativo" if lang == "it" else "* valeur hors des limites de référence · Rapport validé électroniquement · Document fictif à but de démonstration"))
    c.save()
    return {
        "kind": "lab_report", "language": lang, "date": d.isoformat(), "person": person["id"], "person_hint": person["name"], "issuer": issuer["name"],
        "title": title, "values": values, "medications": [], "follow_ups": [], "amount": None,
    }


def paragraphs(c, x, y, width, lines, font="Sans", size=10, leading=5.2 * mm):
    c.setFont(font, size)
    for line in lines:
        if line == "":
            y -= leading * 0.6
            continue
        words = line.split(" ")
        cur = ""
        for w in words:
            trial = (cur + " " + w).strip()
            if pdfmetrics.stringWidth(trial, font, size) > width:
                c.drawString(x, y, cur)
                y -= leading
                cur = w
            else:
                cur = trial
        c.drawString(x, y, cur)
        y -= leading
    return y


def letter(path, person, d, kind, rng):
    # kind in: pediatric, cardio, discharge
    if kind == "pediatric":
        issuer = ISSUERS["ped"]
        title = "Relazione visita pediatrica"
        age = (d - date.fromisoformat(person["born"])).days // 365
        weight = round(14 + age * 3.1 + rng.uniform(-1, 1), 1)
        height = round(84 + age * 6.0 + rng.uniform(-2, 2))
        body = [
            f"Gentile famiglia,",
            f"in data odierna ho visitato {person['name']}, di {age} anni, per il controllo periodico di crescita.",
            "",
            f"Peso {str(weight).replace('.', ',')} kg (50° percentile), altezza {height} cm (60° percentile). Esame obiettivo nella norma: torace libero, addome trattabile, faringe roseo, otoscopia normale bilateralmente.",
            "Lo sviluppo è adeguato all'età. Alimentazione varia, attività sportiva regolare (nuoto due volte a settimana).",
            "",
            "Vaccinazioni: in regola con il calendario; il richiamo contro difterite-tetano-pertosse-polio è previsto all'età di 11 anni.",
            "",
            "Consiglio: proseguire con l'apporto di vitamina D nei mesi invernali (400 UI al giorno), come già in uso.",
            "",
            "Prossimo controllo fra 12 mesi, oppure prima se necessario.",
            "",
            "Cordiali saluti,",
            "Dr. Paolo Esempio, pediatra FMH",
        ]
        truth = {"values": [{"name": "Peso", "value": str(weight).replace(".", ","), "unit": "kg", "reference": None, "flag": None, "number": weight, "panel": "visita"}, {"name": "Altezza", "value": str(height), "unit": "cm", "reference": None, "flag": None, "number": height, "panel": "visita"}], "medications": [{"name": "Vitamina D", "dose": "400 UI", "schedule": "al giorno, mesi invernali"}], "follow_ups": [{"what": "controllo pediatrico", "when": "fra 12 mesi"}], "amount": None}
        doc_kind = "letter"
    elif kind == "cardio":
        issuer = ISSUERS["cardio"]
        title = "Referto visita cardiologica"
        sys_bp = int(rng.uniform(128, 142))
        dia_bp = int(rng.uniform(78, 88))
        hr = int(rng.uniform(62, 74))
        body = [
            f"Paziente: {person['name']}, nato il {it_date(date.fromisoformat(person['born']))}. Data visita: {it_date(d)}.",
            "",
            "Motivo della visita: controllo per ipercolesterolemia e familiarità per cardiopatia ischemica.",
            "",
            f"Pressione arteriosa {sys_bp}/{dia_bp} mmHg, frequenza cardiaca {hr} bpm, ritmica. Toni validi, pause libere. Non edemi declivi.",
            "ECG: ritmo sinusale, conduzione nella norma, non alterazioni della ripolarizzazione.",
            "Ecocardiogramma: ventricolo sinistro di normali dimensioni e spessori, funzione sistolica conservata (FE 60%). Valvole normofunzionanti.",
            "",
            "Conclusioni: quadro cardiologico nella norma. Profilo lipidico da ottimizzare con misure dietetiche e attività fisica regolare; si rivaluta il profilo fra 6 mesi.",
            "",
            "Terapia: nessuna terapia farmacologica al momento.",
            "",
            "Controllo cardiologico con profilo lipidico fra 6 mesi.",
            "",
            "Dr. Luca Modello, cardiologo FMH",
        ]
        truth = {"values": [{"name": "Pressione sistolica", "value": str(sys_bp), "unit": "mmHg", "reference": None, "flag": None, "number": sys_bp, "panel": "visita"}, {"name": "Pressione diastolica", "value": str(dia_bp), "unit": "mmHg", "reference": None, "flag": None, "number": dia_bp, "panel": "visita"}, {"name": "Frequenza cardiaca", "value": str(hr), "unit": "bpm", "reference": None, "flag": None, "number": hr, "panel": "visita"}], "medications": [], "follow_ups": [{"what": "controllo cardiologico con profilo lipidico", "when": "fra 6 mesi"}], "amount": None}
        doc_kind = "letter"
    else:
        issuer = ISSUERS["hosp"]
        title = "Lettera di dimissione"
        body = [
            f"Paziente: {person['name']}, nata il {it_date(date.fromisoformat(person['born']))}.",
            f"Ricovero dal {it_date(d - timedelta(days=3))} al {it_date(d)}, reparto di Medicina interna.",
            "",
            "Diagnosi principale: polmonite comunitaria del lobo inferiore destro.",
            "Diagnosi secondarie: ipertensione arteriosa in trattamento; osteoartrosi del ginocchio sinistro.",
            "",
            "Decorso: trattamento antibiotico endovenoso per 3 giorni con buona risposta clinica, apiressia dal secondo giorno, saturazione in aria ambiente 96% alla dimissione.",
            "",
            "Terapia alla dimissione:",
            "- Amoxicillina/acido clavulanico 1 g, 1 compressa ogni 12 ore per altri 4 giorni",
            "- Lisinopril 10 mg, 1 compressa al mattino (terapia abituale)",
            "- Paracetamolo 1 g al bisogno, massimo 3 volte al giorno",
            "",
            "Controlli: visita dal medico curante entro 7 giorni; radiografia del torace di controllo fra 6 settimane.",
            "",
            "Dr.ssa Anna Campione, medico assistente · Dr. Giorgio Esempio, caposervizio",
        ]
        truth = {"values": [], "medications": [{"name": "Amoxicillina/acido clavulanico", "dose": "1 g", "schedule": "1 compressa ogni 12 ore per 4 giorni"}, {"name": "Lisinopril", "dose": "10 mg", "schedule": "1 compressa al mattino"}, {"name": "Paracetamolo", "dose": "1 g", "schedule": "al bisogno, massimo 3 volte al giorno"}], "follow_ups": [{"what": "visita dal medico curante", "when": "entro 7 giorni"}, {"what": "radiografia del torace di controllo", "when": "fra 6 settimane"}], "amount": None}
        doc_kind = "discharge"
    c = canvas.Canvas(path, pagesize=A4)
    y = draw_header(c, issuer, title, [f"Lugano, {it_date(d)}"])
    paragraphs(c, 20 * mm, y, W - 40 * mm, body)
    footer(c, "Documento fittizio a scopo dimostrativo")
    c.save()
    return {"kind": doc_kind, "language": "it", "date": d.isoformat(), "person": person["id"], "person_hint": person["name"], "issuer": issuer["name"], "title": title, **truth}


def prescription(path, person, d, rng):
    issuer = ISSUERS["gp"]
    meds = [("Atorvastatina", "20 mg", "1 compressa la sera", 3), ("Vitamina D3 gocce", "800 UI", "4 gocce al giorno", 2)] if person["id"] == "marco" else [("Lisinopril", "10 mg", "1 compressa al mattino", 3), ("Calcio + Vitamina D3", "500 mg / 400 UI", "1 compressa al giorno", 3)]
    c = canvas.Canvas(path, pagesize=A4)
    y = draw_header(c, issuer, "Ricetta medica", [f"Paziente: {person['name']}, nato/a il {it_date(date.fromisoformat(person['born']))}", f"Data: {it_date(d)}"])
    lines = ["Rp."]
    for name, dose, sched, boxes in meds:
        lines += [f"{name} {dose}", f"   S. {sched}", f"   {boxes} confezioni", ""]
    lines += ["Ripetibile per 6 mesi.", "", "Dr.ssa Elena Prova, medicina generale FMH"]
    paragraphs(c, 20 * mm, y, W - 40 * mm, lines)
    footer(c, "Documento fittizio a scopo dimostrativo")
    c.save()
    return {"kind": "prescription", "language": "it", "date": d.isoformat(), "person": person["id"], "person_hint": person["name"], "issuer": issuer["name"], "title": "Ricetta medica", "values": [], "medications": [{"name": n, "dose": dd, "schedule": s} for n, dd, s, _ in meds], "follow_ups": [], "amount": None}


def vaccination(path, person, rng):
    issuer = ISSUERS["ped"]
    born = date.fromisoformat(person["born"])
    rows = [
        ("DTPa-IPV-Hib-HepB", born + timedelta(days=61)), ("DTPa-IPV-Hib-HepB", born + timedelta(days=122)), ("DTPa-IPV-Hib-HepB", born + timedelta(days=365)),
        ("Pneumococco", born + timedelta(days=61)), ("Pneumococco", born + timedelta(days=122)), ("Pneumococco", born + timedelta(days=365)),
        ("MPR", born + timedelta(days=275)), ("MPR", born + timedelta(days=366)), ("Varicella", born + timedelta(days=366)),
        ("DTPa-IPV (richiamo)", born + timedelta(days=4 * 365 + 40)),
    ]
    c = canvas.Canvas(path, pagesize=A4)
    y = draw_header(c, issuer, "Certificato delle vaccinazioni", [f"Nome: {person['name']}", f"Data di nascita: {it_date(born)}"])
    c.setFont("SansB", 9)
    c.drawString(20 * mm, y, "Vaccino")
    c.drawString(90 * mm, y, "Data")
    c.drawString(120 * mm, y, "Lotto")
    y -= 7 * mm
    c.setFont("Sans", 9.5)
    for name, dd in rows:
        c.drawString(20 * mm, y, name)
        c.drawString(90 * mm, y, it_date(dd))
        c.setFont("Mono", 8.5)
        c.drawString(120 * mm, y, f"X{rng.randint(1000, 9999)}D")
        c.setFont("Sans", 9.5)
        y -= 6 * mm
    footer(c, "Documento fittizio a scopo dimostrativo")
    c.save()
    return {"kind": "vaccination", "language": "it", "date": rows[-1][1].isoformat(), "person": person["id"], "person_hint": person["name"], "issuer": issuer["name"], "title": "Certificato delle vaccinazioni", "values": [], "medications": [], "follow_ups": [], "amount": None, "vaccines": [{"name": n, "date": dd.isoformat()} for n, dd in rows]}


def imaging(path, person, d):
    issuer = ISSUERS["radio"]
    body = [
        f"Paziente: {person['name']}, nata il {it_date(date.fromisoformat(person['born']))}. Esame del {it_date(d)}.",
        "",
        "ESAME: Radiografia del ginocchio sinistro in due proiezioni.",
        "QUESITO: gonalgia sinistra da alcuni mesi.",
        "",
        "REFERTO: Riduzione dello spazio articolare femoro-tibiale mediale con sclerosi subcondrale e piccoli osteofiti marginali. Non lesioni ossee focali. Non versamento articolare apprezzabile. Rotula in sede.",
        "",
        "CONCLUSIONI: quadro compatibile con gonartrosi di grado lieve-moderato del compartimento mediale.",
        "",
        "Dr. Andrea Modello, radiologo FMH",
    ]
    c = canvas.Canvas(path, pagesize=A4)
    y = draw_header(c, issuer, "Referto radiologico", [f"Lugano, {it_date(d)}"])
    paragraphs(c, 20 * mm, y, W - 40 * mm, body)
    footer(c, "Documento fittizio a scopo dimostrativo")
    c.save()
    return {"kind": "imaging_report", "language": "it", "date": d.isoformat(), "person": person["id"], "person_hint": person["name"], "issuer": issuer["name"], "title": "Referto radiologico", "values": [], "medications": [], "follow_ups": [], "amount": None}


def invoice(path, person, d, who, rng):
    issuer = ISSUERS[who]
    items = {
        "lab": [("Emocromo completo", 18.50), ("Profilo lipidico", 42.00), ("Glicemia", 6.20), ("Creatinina", 7.40), ("Prelievo", 12.00)],
        "pharm": [("Atorvastatina 20 mg, 100 cpr", 38.90), ("Vitamina D3 gocce", 14.50)],
        "hosp": [("Degenza 3 giorni, reparto medicina", 2460.00), ("Esami di laboratorio", 186.30), ("Radiografia torace", 142.00)],
    }[who]
    total = round(sum(p for _, p in items), 2)
    c = canvas.Canvas(path, pagesize=A4)
    y = draw_header(c, issuer, "Fattura", [f"Destinatario: {person['name']}", f"Data fattura: {it_date(d)}", f"N. fattura: {d.year}-{rng.randint(10000, 99999)}"])
    c.setFont("SansB", 9)
    c.drawString(20 * mm, y, "Prestazione")
    c.drawRightString(W - 20 * mm, y, "Importo CHF")
    y -= 7 * mm
    c.setFont("Sans", 9.5)
    for name, price in items:
        c.drawString(20 * mm, y, name)
        c.drawRightString(W - 20 * mm, y, f"{price:,.2f}".replace(",", "'"))
        y -= 6 * mm
    c.line(120 * mm, y + 2 * mm, W - 20 * mm, y + 2 * mm)
    c.setFont("SansB", 10)
    c.drawString(120 * mm, y - 3 * mm, "Totale CHF")
    c.drawRightString(W - 20 * mm, y - 3 * mm, f"{total:,.2f}".replace(",", "'"))
    y -= 14 * mm
    c.setFont("Sans", 9)
    c.drawString(20 * mm, y, "Pagabile entro 30 giorni. Da inoltrare alla cassa malati per il rimborso.")
    footer(c, "Documento fittizio a scopo dimostrativo")
    c.save()
    return {"kind": "invoice", "language": "it", "date": d.isoformat(), "person": person["id"], "person_hint": person["name"], "issuer": issuer["name"], "title": "Fattura", "values": [], "medications": [], "follow_ups": [], "amount": {"total": total, "currency": "CHF"}}


def insurance(path, person, d):
    issuer = ISSUERS["ins"]
    c = canvas.Canvas(path, pagesize=A4)
    y = draw_header(c, issuer, "Polizza assicurazione malattia", [f"Assicurato/a: {person['name']}", f"Decorrenza: 01.01.{d.year}", f"N. polizza: {d.year}.{abs(hash(person['id'])) % 9000000 + 1000000}"])
    rows = [
        ("Assicurazione obbligatoria delle cure (LAMal)", "Modello medico di famiglia", "Franchigia CHF 2'500", "Premio mensile CHF 318.40"),
        ("Complementare ospedaliera", "Reparto comune, tutta la Svizzera", "", "Premio mensile CHF 24.90"),
        ("Complementare ambulatoriale", "Medicina complementare, occhiali, fitness", "Partecipazione 10%", "Premio mensile CHF 41.20"),
    ]
    c.setFont("SansB", 9)
    c.drawString(20 * mm, y, "Copertura")
    c.drawString(95 * mm, y, "Dettaglio")
    c.drawString(150 * mm, y, "Condizioni")
    y -= 7 * mm
    for a, b, cc, dd in rows:
        c.setFont("Sans", 9)
        c.drawString(20 * mm, y, a)
        c.drawString(95 * mm, y, b)
        c.drawString(150 * mm, y, cc)
        y -= 5 * mm
        c.setFont("Sans", 8.5)
        c.drawString(95 * mm, y, dd)
        y -= 7 * mm
    y -= 4 * mm
    y = paragraphs(c, 20 * mm, y, W - 40 * mm, ["Aliquota percentuale: 10% dei costi oltre la franchigia, massimo CHF 700 all'anno.", "Contributo ai costi di degenza ospedaliera: CHF 15 al giorno.", "Disdetta possibile per fine anno con preavviso di un mese (entro il 30 novembre)."], size=9.5)
    footer(c, "Documento fittizio a scopo dimostrativo")
    c.save()
    return {"kind": "insurance", "language": "it", "date": date(d.year, 1, 1).isoformat(), "person": person["id"], "person_hint": person["name"], "issuer": issuer["name"], "title": "Polizza assicurazione malattia", "values": [], "medications": [], "follow_ups": [{"what": "termine di disdetta della polizza", "when": "30 novembre"}], "amount": {"total": 384.50, "currency": "CHF"}}


# Photo-like rendering ----------------------------------------------------------

def to_photo(pdf, out, rng, page=1):
    """Render page 1 of the PDF and make it look like a phone photo."""
    base = out[:-4]
    subprocess.run(["pdftoppm", "-r", "110", "-jpeg", "-f", str(page), "-l", str(page), "-singlefile", pdf, base], check=True)
    rot = rng.uniform(-2.5, 2.5)
    bright = rng.uniform(95, 104)
    ops = [
        base + ".jpg", "-rotate", f"{rot:.2f}", "-background", "#6b6b6b", "-gravity", "center", "-extent", "110%x108%",
        "-modulate", f"{bright:.0f},92", "-attenuate", "0.25", "+noise", "Gaussian", "-blur", "0x0.4",
        "-fill", "black", "-colorize", "0", "-quality", "82", out,
    ]
    subprocess.run(["convert"] + ops, check=True)
    if os.path.exists(base + ".jpg") and base + ".jpg" != out:
        os.remove(base + ".jpg")


# Main ------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="corpus")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    out = args.out
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, "pdf"))
    os.makedirs(os.path.join(out, "photo"))
    people = {p["id"]: p for p in FAMILY["people"]}
    start = date(2024, 9, 1)
    docs = []

    def add(maker, fname, photo=True, pages=1):
        pdf = os.path.join(out, "pdf", fname + ".pdf")
        truth = maker(pdf)
        truth["file"] = f"pdf/{fname}.pdf"
        truth["id"] = fname
        if photo:
            jpg = os.path.join(out, "photo", fname + ".jpg")
            to_photo(pdf, jpg, rng)
            truth["photo"] = f"photo/{fname}.jpg"
        docs.append(truth)

    # Marco: lipids and metabolism every 6 months, a cardiology visit, prescriptions, invoices
    for i, months in enumerate([0, 6, 12, 18, 24]):
        d = start + timedelta(days=int(months * 30.4) + rng.randint(0, 6))
        add(lambda p, d=d, i=i: lab_report(p, people["marco"], d, ["emocromo", "lipidi", "metabolico"] + (["ferro"] if i % 2 == 0 else []), rng, months / 12), f"marco-lab-{d.isoformat()}")
    add(lambda p: letter(p, people["marco"], start + timedelta(days=400), "cardio", rng), "marco-cardio-2025-10")
    add(lambda p: prescription(p, people["marco"], start + timedelta(days=405), rng), "marco-ricetta-2025-10")
    add(lambda p: invoice(p, people["marco"], start + timedelta(days=20), "lab", rng), "marco-fattura-lab-2024-09")
    add(lambda p: invoice(p, people["marco"], start + timedelta(days=410), "pharm", rng), "marco-fattura-farmacia-2025-10")
    add(lambda p: insurance(p, people["marco"], date(2026, 1, 1)), "marco-polizza-2026", photo=False)

    # Giulia: thyroid and iron yearly (one report in French from a Geneva lab)
    for i, months in enumerate([2, 14, 26]):
        d = start + timedelta(days=int(months * 30.4) + rng.randint(0, 6))
        lang = "fr" if i == 1 else "it"
        add(lambda p, d=d, lang=lang, months=months: lab_report(p, people["giulia"], d, ["emocromo", "tiroide", "ferro"], rng, months / 12, lang=lang), f"giulia-lab-{d.isoformat()}")

    # Tommaso: paediatric letters yearly, vaccination card
    for months in [1, 13, 25]:
        d = start + timedelta(days=int(months * 30.4) + rng.randint(0, 6))
        add(lambda p, d=d: letter(p, people["tommaso"], d, "pediatric", rng), f"tommaso-pediatra-{d.isoformat()}")
    add(lambda p: vaccination(p, people["tommaso"], rng), "tommaso-vaccinazioni")

    # Nonna Adele: a hospital stay with discharge letter and invoice, an X-ray, labs
    d_dis = start + timedelta(days=300)
    add(lambda p: letter(p, people["nonna"], d_dis, "discharge", rng), f"adele-dimissione-{d_dis.isoformat()}")
    add(lambda p: invoice(p, people["nonna"], d_dis + timedelta(days=25), "hosp", rng), f"adele-fattura-ospedale-{(d_dis + timedelta(days=25)).isoformat()}")
    add(lambda p: imaging(p, people["nonna"], start + timedelta(days=500)), "adele-rx-ginocchio-2026-01")
    for months in [3, 15]:
        d = start + timedelta(days=int(months * 30.4) + rng.randint(0, 6))
        add(lambda p, d=d, months=months: lab_report(p, people["nonna"], d, ["emocromo", "metabolico", "lipidi"], rng, months / 12), f"adele-lab-{d.isoformat()}")
    add(lambda p: prescription(p, people["nonna"], d_dis + timedelta(days=10), rng), f"adele-ricetta-{(d_dis + timedelta(days=10)).isoformat()}")

    with open(os.path.join(out, "truth.json"), "w", encoding="utf-8") as f:
        json.dump({"family": FAMILY, "documents": docs, "note": "All names, issuers, numbers and dates are invented for demonstration."}, f, ensure_ascii=False, indent=1)
    print(f"{len(docs)} documents in {out}/ ({sum(1 for d in docs if 'photo' in d)} photos)")


if __name__ == "__main__":
    main()
