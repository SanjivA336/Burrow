# Burrow official foods: reviewed list

**Status: ready to load, not yet loaded.** The live database does not have the columns it needs until migrations 0044 and 0045 are pushed.  
Reviewed 2026-10-15.

**325 foods**, each with a shelf life for the pantry, the fridge and the freezer. 26 are marked ⚠ (fresh meat, fish, dairy and leftovers, where a wrong date matters most).

## How to read the columns

| Column | Meaning |
|---|---|
| **Name** | The real name of the food. This is what the search shows. |
| **Dimension / Unit** | How it is measured and the default unit (`g`, `ml` or `count`). The dimension comes from the unit. |
| **Pantry / Fridge / Freezer** | Days from purchase until the suggested expiry **in that place**, for the product as bought (unopened). **Never expires**, **Not recommended** (don't keep it there) or **Unknown** are the codes -1, -2 and -3. Unknown and Not recommended behave the same for now. |

## How the numbers were chosen

- **Cautious on purpose.** Where published storage guidance gives a range, the short end is used.
- **As bought, unopened.** Most things go off sooner once opened. Where opened and unopened differ a lot (ketchup, salsa, pasta sauce, broth, juice), the pantry column is the unopened life and the fridge column is the opened life.
- **Fresh meat, fish, dairy and eggs have no pantry life** (Not recommended). Produce that spoils fast at room temperature does too.
- **Hardy produce** (onions, potatoes, garlic, squash) has a pantry life and, where chilling hurts it, Not recommended for the fridge.
- **Freezer** numbers are quality guides, not safety limits. Frozen vegetables and fruit use 240 days, and frozen prepared meals 90 to 120.
- **Generated estimates**, in the same spirit as the earlier list: not copied from any company's dataset. They need a human read-through before the app depends on them.

## What changed from the earlier draft

**Added 8 foods:** American Cheese (Slices), Coffee Creamer, Deli Roast Beef (Sliced), Lemon Juice (Bottled), Liquor (Spirits), Pepperoni, Shredded Cheddar Cheese, Shredded Mozzarella Cheese.

**Renamed so variants follow one pattern** (the catalog is empty, so renaming is free). The pattern is `Food (Variant)` for variants of one food, `Frozen X` for frozen products, and `X (Canned)` / `X (Dried)` / `X (Dry)` for preserved forms:

- Eggs Large → Eggs (Large)
- Eggs Medium → Eggs (Medium)
- Steak (Beef) → Beef Steak
- Whole Wheat Bread → Bread (Whole Wheat)
- Sourdough Bread → Bread (Sourdough)
- Penne Pasta → Pasta (Penne)
- Macaroni → Pasta (Macaroni)
- Fettuccine → Pasta (Fettuccine)
- Red Onions → Onions (Red)
- Red Potatoes → Potatoes (Red)
- Yukon Gold Potatoes → Potatoes (Yukon Gold)
- Iceberg Lettuce → Lettuce (Iceberg)
- Corn Tortillas → Tortillas (Corn)
- Canned Tuna → Tuna (Canned)
- Canned Salmon → Salmon (Canned)
- Canned Tomatoes → Tomatoes (Canned)
- Canned Peaches → Peaches (Canned)
- Canned Pineapple → Pineapple (Canned)
- Canned Soup → Soup (Canned)
- Chicken Nuggets (Frozen) → Frozen Chicken Nuggets
- Fish Sticks (Frozen) → Frozen Fish Sticks
- Veggie Burgers (Frozen) → Frozen Veggie Burgers
- Dried Cranberries → Cranberries (Dried)

**Numbers corrected for consistency or against usual guidance:**
- Milk freezer life 365 → 90 days; milk fridge life 10 or 12 → 7 days; orange juice 10 → 7; whipped cream 14 → 7.
- Greek yogurt, cream cheese and sour cream 21 → 14 days (matches regular yogurt); Parmesan 90 → 60; hummus 14 → 7; egg whites 10 → 7.
- Frozen vegetables and fruit now share 240 days (they were 240 to 300); frozen pizza 180 → 120; frozen dinners and burritos → 120; frozen nuggets and fish sticks → 90.
- Brown rice 365 → 180 days; all-purpose and bread flour 365 → 240; whole wheat flour 180 → 120 in the pantry.
- Ground spices and dried herbs 1095 → 730; soy sauce 1095 → 730; olive oil 730 → 540; sesame, avocado and teriyaki 730 → 365; cornmeal 365 → 240.
- Honey and white vinegar are now **Never expires** (they were long numbers); salt, sugars and cornstarch stay Never expires.
- Sauces and condiments now split unopened (pantry) from opened (fridge) instead of one number.
- Potatoes split by type (russet 60 days, red and Yukon Gold 30).
- The old single shelf-life number never said which place it belonged to; every food now has all three places filled with a number or a code.

**Cost-split defaults:** none for any food (the earlier PERSONAL defaults on beer, sparkling water, frozen pizza, protein powder, granola bars and potato chips are gone), as decided. Every food starts with everyone ticked.

**Dropped from the old file:** `common_substitutions` (the seed script never loaded it) and the old cost-split values.

## Left out on purpose: one brand dominates

A food that is really one brand's product is better made by the person who buys it
(a user-made "Kraft Macaroni and Cheese"), so a generic version would just sit unused next to it.
Removed from the earlier draft:

- **Macaroni and Cheese (Boxed)** (Kraft)
- **Instant Oatmeal** (Quaker packets)
- **Cooking Spray** (Pam)
- **Hot Cocoa Mix** (Swiss Miss)
- **Coffee Pods** (Keurig K-Cups)

**Kept because the name is a type of food, not a brand**, though one brand leads each: Sriracha, Worcestershire Sauce, American Cheese (Slices), Coffee Creamer, Whipped Cream, Ramen Noodles (Instant) and Energy Drink.

## Alcohol: three broad entries, on purpose

Beer, Wine and Liquor (Spirits) are the only alcohol in the list. For storage there are really
only three behaviours, so one entry each covers every kind without listing them all:

- **Liquor (Spirits)** (vodka, tequila, whiskey, rum, gin and so on): never expires unopened or opened.
- **Beer** (also fits cider, hard seltzer and canned cocktails): about six months in the pantry, longer in the fridge.
- **Wine** (also fits mixed drinks with a wine base): about two years unopened, a few days once open.

A household that wants "Hard Seltzer" or "Margarita Mix" as its own food can create it. Hard Seltzer was
dropped from the earlier draft because it stores like beer and a single brand leads it.

## Still open

1. **Fresh meat, fish, dairy and leftovers (⚠).** Keep a cautious suggestion (2 to 5 days), or leave the fridge blank so the user types the date? The list currently keeps the suggestion.
2. **Baking items** (sugar, baking soda, yeast, cocoa, chocolate chips) sit in *Other* for now.
3. **Search by phrase:** `Tuna (Canned)` is found by "canned tuna" through the similarity search, but not by a plain substring match. Worth checking in the real search box.
4. **Household supplies** (paper towels, cleaning products) are not food and are not in the list.

## Foods by category

### Proteins (55)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Eggs (Large) | Count | count | Not recommended | 35 d | 365 d |
| 2 | Eggs (Medium) | Count | count | Not recommended | 35 d | 365 d |
| 3 | Egg Whites (Carton) | Volume | ml | Not recommended | 7 d | 365 d |
| 4 | Chicken Breast ⚠ | Weight | g | Not recommended | 2 d | 270 d |
| 5 | Chicken Thighs ⚠ | Weight | g | Not recommended | 2 d | 270 d |
| 6 | Chicken Drumsticks ⚠ | Weight | g | Not recommended | 2 d | 270 d |
| 7 | Chicken Wings ⚠ | Weight | g | Not recommended | 2 d | 270 d |
| 8 | Whole Chicken ⚠ | Weight | g | Not recommended | 2 d | 365 d |
| 9 | Ground Chicken ⚠ | Weight | g | Not recommended | 2 d | 120 d |
| 10 | Ground Beef ⚠ | Weight | g | Not recommended | 2 d | 120 d |
| 11 | Ground Turkey ⚠ | Weight | g | Not recommended | 2 d | 120 d |
| 12 | Ground Pork ⚠ | Weight | g | Not recommended | 2 d | 120 d |
| 13 | Beef Steak ⚠ | Weight | g | Not recommended | 3 d | 180 d |
| 14 | Beef Roast ⚠ | Weight | g | Not recommended | 3 d | 180 d |
| 15 | Beef Stew Meat ⚠ | Weight | g | Not recommended | 2 d | 120 d |
| 16 | Pork Chops ⚠ | Weight | g | Not recommended | 3 d | 180 d |
| 17 | Pork Tenderloin ⚠ | Weight | g | Not recommended | 3 d | 180 d |
| 18 | Pork Sausage ⚠ | Weight | g | Not recommended | 2 d | 60 d |
| 19 | Italian Sausage ⚠ | Weight | g | Not recommended | 2 d | 60 d |
| 20 | Bacon | Weight | g | Not recommended | 7 d | 30 d |
| 21 | Hot Dogs | Count | count | Not recommended | 14 d | 60 d |
| 22 | Deli Turkey (Sliced) ⚠ | Weight | g | Not recommended | 5 d | 60 d |
| 23 | Deli Ham (Sliced) ⚠ | Weight | g | Not recommended | 5 d | 60 d |
| 24 | Deli Roast Beef (Sliced) ⚠ | Weight | g | Not recommended | 5 d | 60 d |
| 25 | Salami | Weight | g | Not recommended | 21 d | 60 d |
| 26 | Pepperoni | Weight | g | Not recommended | 21 d | 60 d |
| 27 | Salmon Fillet ⚠ | Weight | g | Not recommended | 2 d | 90 d |
| 28 | Cod Fillet ⚠ | Weight | g | Not recommended | 2 d | 180 d |
| 29 | Tilapia Fillet ⚠ | Weight | g | Not recommended | 2 d | 180 d |
| 30 | Tuna Steak ⚠ | Weight | g | Not recommended | 2 d | 90 d |
| 31 | Shrimp ⚠ | Weight | g | Not recommended | 2 d | 180 d |
| 32 | Scallops ⚠ | Weight | g | Not recommended | 2 d | 90 d |
| 33 | Tofu | Weight | g | Not recommended | 7 d | 150 d |
| 34 | Tempeh | Weight | g | Not recommended | 10 d | 180 d |
| 35 | Tuna (Canned) | Weight | g | 1095 d | Unknown | Not recommended |
| 36 | Salmon (Canned) | Weight | g | 1095 d | Unknown | Not recommended |
| 37 | Sardines (Canned) | Weight | g | 1095 d | Unknown | Not recommended |
| 38 | Black Beans (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 39 | Chickpeas (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 40 | Kidney Beans (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 41 | Pinto Beans (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 42 | Refried Beans (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 43 | Lentils (Dry) | Weight | g | 730 d | Unknown | Unknown |
| 44 | Black Beans (Dry) | Weight | g | 730 d | Unknown | Unknown |
| 45 | Chickpeas (Dry) | Weight | g | 730 d | Unknown | Unknown |
| 46 | Peanut Butter | Weight | g | 270 d | Unknown | Unknown |
| 47 | Almond Butter | Weight | g | 270 d | Unknown | Unknown |
| 48 | Almonds | Weight | g | 180 d | 365 d | 540 d |
| 49 | Walnuts | Weight | g | 180 d | 365 d | 540 d |
| 50 | Peanuts | Weight | g | 180 d | 365 d | 540 d |
| 51 | Cashews | Weight | g | 180 d | 365 d | 540 d |
| 52 | Pecans | Weight | g | 180 d | 365 d | 540 d |
| 53 | Frozen Chicken Nuggets | Weight | g | Not recommended | Unknown | 90 d |
| 54 | Frozen Fish Sticks | Weight | g | Not recommended | Unknown | 90 d |
| 55 | Frozen Veggie Burgers | Count | count | Not recommended | Unknown | 180 d |

### Vegetables & herbs (53)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Carrots | Weight | g | Not recommended | 30 d | 240 d |
| 2 | Baby Carrots | Weight | g | Not recommended | 21 d | 240 d |
| 3 | Celery | Count | count | Not recommended | 21 d | 240 d |
| 4 | Bell Peppers | Count | count | Not recommended | 14 d | 240 d |
| 5 | Broccoli | Weight | g | Not recommended | 7 d | 240 d |
| 6 | Cauliflower | Count | count | Not recommended | 7 d | 240 d |
| 7 | Spinach | Weight | g | Not recommended | 7 d | 240 d |
| 8 | Kale | Weight | g | Not recommended | 5 d | 240 d |
| 9 | Arugula | Weight | g | Not recommended | 5 d | Not recommended |
| 10 | Mixed Greens (Bag) | Weight | g | Not recommended | 5 d | Not recommended |
| 11 | Lettuce (Romaine) | Count | count | Not recommended | 10 d | Not recommended |
| 12 | Lettuce (Iceberg) | Count | count | Not recommended | 14 d | Not recommended |
| 13 | Cucumber | Count | count | Not recommended | 7 d | Not recommended |
| 14 | Mushrooms | Weight | g | Not recommended | 7 d | 240 d |
| 15 | Zucchini | Count | count | Not recommended | 7 d | 240 d |
| 16 | Asparagus | Weight | g | Not recommended | 4 d | 240 d |
| 17 | Green Beans | Weight | g | Not recommended | 7 d | 240 d |
| 18 | Corn on the Cob | Count | count | Not recommended | 3 d | 240 d |
| 19 | Cabbage | Count | count | Not recommended | 21 d | 240 d |
| 20 | Radishes | Weight | g | Not recommended | 14 d | Not recommended |
| 21 | Beets | Weight | g | Not recommended | 14 d | 240 d |
| 22 | Eggplant | Count | count | Not recommended | 7 d | Not recommended |
| 23 | Brussels Sprouts | Weight | g | Not recommended | 7 d | 240 d |
| 24 | Green Onions | Count | count | Not recommended | 7 d | 240 d |
| 25 | Jalapeños | Count | count | Not recommended | 14 d | 240 d |
| 26 | Cilantro | Weight | g | Not recommended | 7 d | 240 d |
| 27 | Parsley (Fresh) | Weight | g | Not recommended | 7 d | 240 d |
| 28 | Basil (Fresh) | Weight | g | 3 d | 5 d | 240 d |
| 29 | Tomatoes | Count | count | 7 d | 10 d | Not recommended |
| 30 | Cherry Tomatoes | Weight | g | 5 d | 10 d | Not recommended |
| 31 | Onions (Yellow) | Count | count | 30 d | 60 d | 240 d |
| 32 | Onions (Red) | Count | count | 30 d | 60 d | 240 d |
| 33 | Shallots | Count | count | 30 d | 60 d | Unknown |
| 34 | Garlic | Count | count | 90 d | Unknown | Unknown |
| 35 | Ginger (Fresh) | Weight | g | 7 d | 21 d | 240 d |
| 36 | Potatoes (Russet) | Count | count | 60 d | Not recommended | Not recommended |
| 37 | Potatoes (Red) | Count | count | 30 d | Not recommended | Not recommended |
| 38 | Potatoes (Yukon Gold) | Count | count | 30 d | Not recommended | Not recommended |
| 39 | Sweet Potatoes | Count | count | 35 d | Not recommended | Unknown |
| 40 | Butternut Squash | Count | count | 90 d | Unknown | 240 d |
| 41 | Corn (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 42 | Green Beans (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 43 | Tomatoes (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 44 | Tomato Sauce (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 45 | Tomato Paste | Weight | g | 730 d | Unknown | Not recommended |
| 46 | Pumpkin Puree (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 47 | Frozen Peas | Weight | g | Not recommended | Unknown | 240 d |
| 48 | Frozen Corn | Weight | g | Not recommended | Unknown | 240 d |
| 49 | Frozen Broccoli | Weight | g | Not recommended | Unknown | 240 d |
| 50 | Frozen Mixed Vegetables | Weight | g | Not recommended | Unknown | 240 d |
| 51 | Frozen Spinach | Weight | g | Not recommended | Unknown | 240 d |
| 52 | Frozen Green Beans | Weight | g | Not recommended | Unknown | 240 d |
| 53 | Frozen French Fries | Weight | g | Not recommended | Unknown | 240 d |

### Fruits (31)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Apples | Count | count | 7 d | 30 d | Unknown |
| 2 | Bananas | Count | count | 6 d | 10 d | 60 d |
| 3 | Oranges | Count | count | 7 d | 21 d | Not recommended |
| 4 | Lemons | Count | count | 7 d | 21 d | Unknown |
| 5 | Limes | Count | count | 7 d | 21 d | Unknown |
| 6 | Grapefruit | Count | count | 7 d | 21 d | Not recommended |
| 7 | Clementines | Count | count | 7 d | 21 d | Not recommended |
| 8 | Avocado | Count | count | 5 d | 5 d | Unknown |
| 9 | Pears | Count | count | 5 d | 7 d | Unknown |
| 10 | Peaches | Count | count | 3 d | 5 d | 240 d |
| 11 | Plums | Count | count | 3 d | 5 d | 240 d |
| 12 | Kiwi | Count | count | 7 d | 14 d | Unknown |
| 13 | Mango | Count | count | 5 d | 7 d | 240 d |
| 14 | Pineapple | Count | count | 2 d | 5 d | 240 d |
| 15 | Watermelon | Count | count | 7 d | 14 d | Unknown |
| 16 | Cantaloupe | Count | count | 5 d | 14 d | 240 d |
| 17 | Strawberries | Weight | g | Not recommended | 5 d | 240 d |
| 18 | Blueberries | Weight | g | Not recommended | 10 d | 240 d |
| 19 | Raspberries | Weight | g | Not recommended | 3 d | 240 d |
| 20 | Blackberries | Weight | g | Not recommended | 3 d | 240 d |
| 21 | Cherries | Weight | g | Not recommended | 5 d | 240 d |
| 22 | Grapes | Weight | g | Not recommended | 7 d | 240 d |
| 23 | Raisins | Weight | g | 180 d | Unknown | Unknown |
| 24 | Cranberries (Dried) | Weight | g | 180 d | Unknown | Unknown |
| 25 | Applesauce | Weight | g | 365 d | 7 d | Unknown |
| 26 | Peaches (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 27 | Pineapple (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 28 | Frozen Strawberries | Weight | g | Not recommended | Unknown | 240 d |
| 29 | Frozen Blueberries | Weight | g | Not recommended | Unknown | 240 d |
| 30 | Frozen Mango | Weight | g | Not recommended | Unknown | 240 d |
| 31 | Frozen Mixed Berries | Weight | g | Not recommended | Unknown | 240 d |

### Grains & breads (38)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Bread (White) | Count | count | 7 d | 14 d | 90 d |
| 2 | Bread (Whole Wheat) | Count | count | 7 d | 14 d | 90 d |
| 3 | Bread (Sourdough) | Count | count | 5 d | 10 d | 90 d |
| 4 | Bagels | Count | count | 5 d | 10 d | 90 d |
| 5 | English Muffins | Count | count | 7 d | 14 d | 90 d |
| 6 | Hamburger Buns | Count | count | 7 d | 14 d | 90 d |
| 7 | Hot Dog Buns | Count | count | 7 d | 14 d | 90 d |
| 8 | Dinner Rolls | Count | count | 7 d | 14 d | 90 d |
| 9 | Pita Bread | Count | count | 7 d | 14 d | 90 d |
| 10 | Naan | Count | count | 7 d | 14 d | 90 d |
| 11 | Croissants | Count | count | 3 d | 7 d | 60 d |
| 12 | Tortillas (Flour) | Count | count | 14 d | 30 d | 90 d |
| 13 | Tortillas (Corn) | Count | count | 14 d | 30 d | 90 d |
| 14 | White Rice | Weight | g | 730 d | Unknown | Unknown |
| 15 | Jasmine Rice | Weight | g | 730 d | Unknown | Unknown |
| 16 | Basmati Rice | Weight | g | 730 d | Unknown | Unknown |
| 17 | Brown Rice | Weight | g | 180 d | Unknown | Unknown |
| 18 | Pasta (Spaghetti) | Weight | g | 730 d | Unknown | Unknown |
| 19 | Pasta (Penne) | Weight | g | 730 d | Unknown | Unknown |
| 20 | Pasta (Macaroni) | Weight | g | 730 d | Unknown | Unknown |
| 21 | Pasta (Fettuccine) | Weight | g | 730 d | Unknown | Unknown |
| 22 | Lasagna Noodles | Weight | g | 730 d | Unknown | Unknown |
| 23 | Egg Noodles | Weight | g | 730 d | Unknown | Unknown |
| 24 | Rice Noodles | Weight | g | 730 d | Unknown | Unknown |
| 25 | Ramen Noodles (Instant) | Count | count | 365 d | Unknown | Unknown |
| 26 | Couscous | Weight | g | 365 d | Unknown | Unknown |
| 27 | Quinoa | Weight | g | 730 d | Unknown | Unknown |
| 28 | Barley | Weight | g | 730 d | Unknown | Unknown |
| 29 | Rolled Oats | Weight | g | 365 d | Unknown | Unknown |
| 30 | Granola | Weight | g | 120 d | Unknown | Unknown |
| 31 | Cold Cereal | Weight | g | 180 d | Unknown | Unknown |
| 32 | Pancake Mix | Weight | g | 270 d | Unknown | Unknown |
| 33 | All-Purpose Flour | Weight | g | 240 d | Unknown | Unknown |
| 34 | Bread Flour | Weight | g | 240 d | Unknown | Unknown |
| 35 | Whole Wheat Flour | Weight | g | 120 d | 365 d | Unknown |
| 36 | Cornmeal | Weight | g | 240 d | Unknown | Unknown |
| 37 | Breadcrumbs | Weight | g | 180 d | Unknown | Unknown |
| 38 | Frozen Waffles | Count | count | Not recommended | Unknown | 60 d |

### Dairy & alternatives (37)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Whole Milk | Volume | ml | Not recommended | 7 d | 90 d |
| 2 | 2% Milk | Volume | ml | Not recommended | 7 d | 90 d |
| 3 | Skim Milk | Volume | ml | Not recommended | 7 d | 90 d |
| 4 | Lactose-Free Milk | Volume | ml | Not recommended | 14 d | 90 d |
| 5 | Chocolate Milk | Volume | ml | Not recommended | 7 d | Not recommended |
| 6 | Oat Milk | Volume | ml | 270 d | 10 d | Not recommended |
| 7 | Almond Milk | Volume | ml | 270 d | 10 d | Not recommended |
| 8 | Soy Milk | Volume | ml | 270 d | 10 d | Not recommended |
| 9 | Coconut Milk (Canned) | Volume | ml | 730 d | 5 d | Not recommended |
| 10 | Half-and-Half | Volume | ml | Not recommended | 7 d | Unknown |
| 11 | Heavy Cream | Volume | ml | Not recommended | 10 d | 90 d |
| 12 | Buttermilk | Volume | ml | Not recommended | 10 d | Unknown |
| 13 | Whipped Cream | Volume | ml | Not recommended | 7 d | Unknown |
| 14 | Coffee Creamer | Volume | ml | Unknown | 14 d | Not recommended |
| 15 | Butter | Weight | g | 2 d | 60 d | 270 d |
| 16 | Margarine | Weight | g | Unknown | 120 d | 270 d |
| 17 | Cheddar Cheese | Weight | g | Not recommended | 30 d | 180 d |
| 18 | Colby Jack Cheese | Weight | g | Not recommended | 30 d | 180 d |
| 19 | Monterey Jack Cheese | Weight | g | Not recommended | 30 d | 180 d |
| 20 | Swiss Cheese | Weight | g | Not recommended | 30 d | 180 d |
| 21 | Provolone Cheese | Weight | g | Not recommended | 30 d | 180 d |
| 22 | Mozzarella Cheese | Weight | g | Not recommended | 21 d | 180 d |
| 23 | Parmesan Cheese | Weight | g | Not recommended | 60 d | 240 d |
| 24 | Feta Cheese | Weight | g | Not recommended | 21 d | Unknown |
| 25 | Brie | Weight | g | Not recommended | 14 d | Not recommended |
| 26 | Goat Cheese | Weight | g | Not recommended | 14 d | 180 d |
| 27 | Ricotta Cheese | Weight | g | Not recommended | 10 d | Not recommended |
| 28 | Cottage Cheese | Weight | g | Not recommended | 10 d | Not recommended |
| 29 | Cream Cheese | Weight | g | Not recommended | 14 d | Not recommended |
| 30 | Sour Cream | Weight | g | Not recommended | 14 d | Not recommended |
| 31 | American Cheese (Slices) | Weight | g | Not recommended | 30 d | Unknown |
| 32 | Shredded Cheddar Cheese | Weight | g | Not recommended | 14 d | 180 d |
| 33 | Shredded Mozzarella Cheese | Weight | g | Not recommended | 14 d | 180 d |
| 34 | String Cheese | Count | count | Not recommended | 30 d | Unknown |
| 35 | Greek Yogurt | Weight | g | Not recommended | 14 d | Not recommended |
| 36 | Regular Yogurt | Weight | g | Not recommended | 14 d | Not recommended |
| 37 | Kefir | Volume | ml | Not recommended | 14 d | Not recommended |

### Seasonings & spices (29)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Salt | Weight | g | Never expires | Unknown | Unknown |
| 2 | Black Pepper | Weight | g | 730 d | Unknown | Unknown |
| 3 | Garlic Powder | Weight | g | 730 d | Unknown | Unknown |
| 4 | Onion Powder | Weight | g | 730 d | Unknown | Unknown |
| 5 | Garlic Salt | Weight | g | 730 d | Unknown | Unknown |
| 6 | Seasoned Salt | Weight | g | 730 d | Unknown | Unknown |
| 7 | Paprika | Weight | g | 730 d | Unknown | Unknown |
| 8 | Smoked Paprika | Weight | g | 730 d | Unknown | Unknown |
| 9 | Cumin | Weight | g | 730 d | Unknown | Unknown |
| 10 | Chili Powder | Weight | g | 730 d | Unknown | Unknown |
| 11 | Cayenne Pepper | Weight | g | 730 d | Unknown | Unknown |
| 12 | Red Pepper Flakes | Weight | g | 730 d | Unknown | Unknown |
| 13 | Cinnamon | Weight | g | 730 d | Unknown | Unknown |
| 14 | Nutmeg | Weight | g | 730 d | Unknown | Unknown |
| 15 | Ground Cloves | Weight | g | 730 d | Unknown | Unknown |
| 16 | Allspice | Weight | g | 730 d | Unknown | Unknown |
| 17 | Ground Ginger | Weight | g | 730 d | Unknown | Unknown |
| 18 | Ground Coriander | Weight | g | 730 d | Unknown | Unknown |
| 19 | Turmeric | Weight | g | 730 d | Unknown | Unknown |
| 20 | Curry Powder | Weight | g | 730 d | Unknown | Unknown |
| 21 | Italian Seasoning | Weight | g | 730 d | Unknown | Unknown |
| 22 | Taco Seasoning | Weight | g | 730 d | Unknown | Unknown |
| 23 | Oregano (Dried) | Weight | g | 730 d | Unknown | Unknown |
| 24 | Basil (Dried) | Weight | g | 730 d | Unknown | Unknown |
| 25 | Thyme (Dried) | Weight | g | 730 d | Unknown | Unknown |
| 26 | Rosemary (Dried) | Weight | g | 730 d | Unknown | Unknown |
| 27 | Parsley (Dried) | Weight | g | 730 d | Unknown | Unknown |
| 28 | Bay Leaves | Weight | g | 730 d | Unknown | Unknown |
| 29 | Vanilla Extract | Volume | ml | 1825 d | Unknown | Unknown |

### Oils & fats (8)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Olive Oil | Volume | ml | 540 d | Unknown | Unknown |
| 2 | Vegetable Oil | Volume | ml | 365 d | Unknown | Unknown |
| 3 | Canola Oil | Volume | ml | 365 d | Unknown | Unknown |
| 4 | Sesame Oil | Volume | ml | 365 d | Unknown | Unknown |
| 5 | Avocado Oil | Volume | ml | 365 d | Unknown | Unknown |
| 6 | Coconut Oil | Volume | ml | 540 d | Unknown | Unknown |
| 7 | Ghee | Weight | g | 365 d | Unknown | Unknown |
| 8 | Vegetable Shortening | Weight | g | 365 d | Unknown | Unknown |

### Sauces & condiments (27)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Ketchup | Volume | ml | 365 d | 180 d | Unknown |
| 2 | Mustard | Volume | ml | 730 d | 365 d | Unknown |
| 3 | Mayonnaise | Volume | ml | 180 d | 60 d | Not recommended |
| 4 | Soy Sauce | Volume | ml | 730 d | Unknown | Unknown |
| 5 | Hot Sauce | Volume | ml | 730 d | Unknown | Unknown |
| 6 | Sriracha | Volume | ml | 730 d | Unknown | Unknown |
| 7 | BBQ Sauce | Volume | ml | 365 d | 180 d | Unknown |
| 8 | Teriyaki Sauce | Volume | ml | 365 d | Unknown | Unknown |
| 9 | Worcestershire Sauce | Volume | ml | 730 d | Unknown | Unknown |
| 10 | Honey | Volume | ml | Never expires | Unknown | Unknown |
| 11 | Maple Syrup | Volume | ml | 730 d | 365 d | Unknown |
| 12 | Salsa | Volume | ml | 365 d | 14 d | Unknown |
| 13 | Pasta Sauce (Jar) | Volume | ml | 540 d | 7 d | Unknown |
| 14 | Alfredo Sauce (Jar) | Volume | ml | 365 d | 5 d | Unknown |
| 15 | Ranch Dressing | Volume | ml | 365 d | 60 d | Not recommended |
| 16 | Italian Dressing | Volume | ml | 365 d | 90 d | Not recommended |
| 17 | Balsamic Vinegar | Volume | ml | 1095 d | Unknown | Unknown |
| 18 | White Vinegar | Volume | ml | Never expires | Unknown | Unknown |
| 19 | Apple Cider Vinegar | Volume | ml | 1095 d | Unknown | Unknown |
| 20 | Red Wine Vinegar | Volume | ml | 1095 d | Unknown | Unknown |
| 21 | Lemon Juice (Bottled) | Volume | ml | 365 d | 180 d | Unknown |
| 22 | Relish | Volume | ml | 365 d | 180 d | Unknown |
| 23 | Pickles (Jar) | Weight | g | 540 d | 90 d | Not recommended |
| 24 | Olives (Jar) | Weight | g | 730 d | 60 d | Not recommended |
| 25 | Strawberry Jam | Weight | g | 540 d | 180 d | Unknown |
| 26 | Grape Jelly | Weight | g | 540 d | 180 d | Unknown |
| 27 | Hummus | Weight | g | Not recommended | 7 d | 120 d |

### Snacks & sweets (14)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Potato Chips | Count | count | 60 d | Unknown | Not recommended |
| 2 | Tortilla Chips | Weight | g | 120 d | Unknown | Not recommended |
| 3 | Pretzels | Weight | g | 120 d | Unknown | Unknown |
| 4 | Crackers | Count | count | 120 d | Unknown | Unknown |
| 5 | Granola Bars | Count | count | 180 d | Unknown | Unknown |
| 6 | Protein Bars | Count | count | 270 d | Unknown | Unknown |
| 7 | Microwave Popcorn | Count | count | 270 d | Unknown | Unknown |
| 8 | Cookies | Weight | g | 60 d | Unknown | 90 d |
| 9 | Chocolate Bar | Count | count | 270 d | Unknown | Unknown |
| 10 | Candy | Weight | g | 365 d | Unknown | Unknown |
| 11 | Fruit Snacks | Count | count | 365 d | Unknown | Unknown |
| 12 | Trail Mix | Weight | g | 180 d | Unknown | Unknown |
| 13 | Ice Cream | Volume | ml | Not recommended | Not recommended | 60 d |
| 14 | Popsicles | Count | count | Not recommended | Not recommended | 180 d |

### Beverages (14)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Orange Juice | Volume | ml | Not recommended | 7 d | 90 d |
| 2 | Apple Juice | Volume | ml | Not recommended | 7 d | 90 d |
| 3 | Coffee (Ground) | Weight | g | 180 d | Unknown | Unknown |
| 4 | Coffee (Whole Bean) | Weight | g | 180 d | Unknown | Unknown |
| 5 | Instant Coffee | Weight | g | 730 d | Unknown | Unknown |
| 6 | Tea Bags | Count | count | 730 d | Unknown | Unknown |
| 7 | Sparkling Water | Count | count | 270 d | Unknown | Not recommended |
| 8 | Soda | Count | count | 270 d | Unknown | Not recommended |
| 9 | Energy Drink | Count | count | 365 d | Unknown | Not recommended |
| 10 | Bottled Water | Count | count | Never expires | Unknown | Not recommended |
| 11 | Coconut Water | Volume | ml | 270 d | 5 d | Not recommended |
| 12 | Beer | Count | count | 180 d | 270 d | Not recommended |
| 13 | Wine | Volume | ml | 730 d | 5 d | Not recommended |
| 14 | Liquor (Spirits) | Volume | ml | Never expires | Unknown | Unknown |

### Other (baking, broths, prepared) (19)

| # | Name | Dimension | Unit | Pantry | Fridge | Freezer |
|--:|---|---|---|---|---|---|
| 1 | Granulated Sugar | Weight | g | Never expires | Unknown | Unknown |
| 2 | Brown Sugar | Weight | g | Never expires | Unknown | Unknown |
| 3 | Powdered Sugar | Weight | g | Never expires | Unknown | Unknown |
| 4 | Cornstarch | Weight | g | Never expires | Unknown | Unknown |
| 5 | Baking Soda | Weight | g | 730 d | Unknown | Unknown |
| 6 | Baking Powder | Weight | g | 365 d | Unknown | Unknown |
| 7 | Active Dry Yeast | Weight | g | 365 d | 120 d | Unknown |
| 8 | Cocoa Powder | Weight | g | 730 d | Unknown | Unknown |
| 9 | Chocolate Chips | Weight | g | 540 d | Unknown | Unknown |
| 10 | Protein Powder | Weight | g | 365 d | Unknown | Unknown |
| 11 | Chicken Broth | Volume | ml | 730 d | 5 d | 90 d |
| 12 | Vegetable Broth | Volume | ml | 730 d | 5 d | 90 d |
| 13 | Beef Broth | Volume | ml | 730 d | 5 d | 90 d |
| 14 | Bouillon Cubes | Count | count | 730 d | Unknown | Unknown |
| 15 | Soup (Canned) | Weight | g | 730 d | Unknown | Not recommended |
| 16 | Frozen Pizza | Count | count | Not recommended | Unknown | 120 d |
| 17 | Frozen Burritos | Count | count | Not recommended | Unknown | 120 d |
| 18 | Frozen Dinner | Count | count | Not recommended | Unknown | 120 d |
| 19 | Leftovers (Cooked) ⚠ | Count | count | Not recommended | 3 d | 90 d |
