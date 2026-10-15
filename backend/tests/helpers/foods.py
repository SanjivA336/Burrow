"""Test-only helper: a food to buy, without depending on what the catalog holds.

The integration tests used to assume the catalog already contained "Whole Milk"
and "Butter". The catalog is now reloaded from a reviewed list, so a test can't
count on any particular food being there. This finds the food by name and, if
it isn't in the catalog, creates it the way a user would.
"""

# Usual unit and category for the few foods the tests buy.
_KNOWN = {
    "whole milk": ("ml", "DAIRY_ALTERNATIVES"),
    "butter": ("g", "DAIRY_ALTERNATIVES"),
}


async def find_or_create_food(api_client, headers: dict, name: str, **fields) -> dict:
    """The catalog entry named `name` (as the API returns it). Extra `fields`
    (for example fridge_shelf_life_days=10) only apply when it has to be created."""
    response = await api_client.get(
        "/api/food-definitions/search", params={"query": name}, headers=headers
    )
    assert response.status_code == 200, response.text
    for found in response.json()["data"]:
        if found["name"].strip().lower() == name.strip().lower():
            return found
    unit, category = _KNOWN.get(name.strip().lower(), ("g", "OTHER"))
    created = await api_client.post(
        "/api/food-definitions",
        json={"name": name, "preferred_unit": unit, "category": category, **fields},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return created.json()["data"]
