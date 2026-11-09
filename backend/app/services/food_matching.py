"""Finds which words in a recipe's steps are foods.

The recipe form sends the words and short phrases it pulled out of the steps ("butter",
"olive oil") and gets back, for each one, the catalog foods that plausibly mean it. The person
always picks; nothing here chooses a food.

Each term is searched on its own (like the barcode lookup does with a product name), because
the catalog's fuzzy search is good at one idea at a time. But a fuzzy hit alone is not enough
to show: "bowl" can fuzzily resemble something. So every result is scored against the term and
only a result whose WORDS line up with the term's words is kept:

    1.0         the food's name is the term ("Butter" for "butter", "Onion" for "onions")
    0.70-0.95   the term's words are all in the food's name ("parmesan" -> "Parmesan Cheese"),
                or the food's name is wholly inside the term ("grated parmesan cheese")
    dropped     only a spelling-close match, with no shared words

Closer coverage scores higher, so "oil" prefers "Oil" over "Olive Oil" over "Peanut Butter Oil".
"""

from concurrent.futures import ThreadPoolExecutor

from pydantic import BaseModel

from app.schemas.food_definition import FoodDefinition
from app.services import food_definitions as food_definitions_service

MAX_TERMS = 80
MAX_TERM_LENGTH = 60
# Results below this are not shown. Only word-level overlap reaches it; see the module note.
MIN_SCORE = 0.7
_MAX_MATCHES_PER_TERM = 3
_SEARCH_LIMIT = 8


class ScoredFood(BaseModel):
    food: FoodDefinition
    score: float


class TermMatch(BaseModel):
    term: str
    matches: list[ScoredFood]


def _singular(word: str) -> str:
    if len(word) > 3 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith(("ses", "xes", "zes", "ches", "shes")):
        return word[:-2]
    if len(word) > 2 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _words(text: str) -> list[str]:
    cleaned = "".join(ch if ch.isalpha() else " " for ch in text.lower())
    return [_singular(word) for word in cleaned.split()]


def score(term: str, food_name: str) -> float:
    """How well the food's name fits the term, 0 when their words do not line up."""
    term_words, name_words = _words(term), _words(food_name)
    if not term_words or not name_words:
        return 0.0
    if term_words == name_words:
        return 1.0
    term_set, name_set = set(term_words), set(name_words)
    if term_set <= name_set:
        # The term says part of the food ("parmesan" of "Parmesan Cheese").
        return 0.7 + 0.25 * len(term_set) / len(name_set)
    if name_set <= term_set:
        # The food is wholly inside the term ("grated parmesan cheese").
        return 0.7 + 0.25 * len(name_set) / len(term_set)
    return 0.0


def _clean_terms(terms: list[str]) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in terms:
        term = " ".join(raw.split())[:MAX_TERM_LENGTH]
        key = term.lower()
        if term and key not in seen:
            seen.add(key)
            cleaned.append(term)
    return cleaned[:MAX_TERMS]


def match_terms(terms: list[str]) -> list[TermMatch]:
    """For each distinct term (in the order given), the foods that fit it well enough to offer,
    best first. A term with no good match is left out of the answer."""
    cleaned = _clean_terms(terms)
    if not cleaned:
        return []
    with ThreadPoolExecutor(max_workers=min(len(cleaned), 8)) as pool:
        found = list(
            pool.map(lambda t: food_definitions_service.search(t, limit=_SEARCH_LIMIT), cleaned)
        )
    results: list[TermMatch] = []
    for term, foods in zip(cleaned, found, strict=True):
        scored = [ScoredFood(food=food, score=score(term, food.name)) for food in foods]
        good = [s for s in scored if s.score >= MIN_SCORE]
        # Stable sort: equal scores keep the catalog search's own order.
        good.sort(key=lambda s: -s.score)
        if good:
            results.append(TermMatch(term=term, matches=good[:_MAX_MATCHES_PER_TERM]))
    return results
