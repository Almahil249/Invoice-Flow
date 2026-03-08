export const categories = [
    "Equipment/Hardware",
    "Transportation",
    "Food/Beverage",
    "Supermarket/Groceries",
    "Office Supplies",
    "Communication",
    "Maintenance",
    "Fuel",
    "Accommodation",
    "Medical",
    "Other",
] as const;

export type Category = typeof categories[number];
