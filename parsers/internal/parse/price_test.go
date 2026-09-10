package parse

import "testing"

func TestPriceRub(t *testing.T) {
	cases := []struct {
		in   string
		want int
		ok   bool
	}{
		{"175 ₽/м", 175, true},
		{"1 526 ₽/шт", 1526, true},
		{"2\u00a0114 ₽/шт", 2114, true}, // nbsp
		{"3 399.97", 3399, true},        // копейки вниз
		{"164 руб.", 164, true},
		{"104", 104, true},
		{"1.526", 1526, true}, // разделитель тысяч
		{"нет цены", 0, false},
		{"", 0, false},
		{"0", 0, false},
	}
	for _, c := range cases {
		got, ok := PriceRub(c.in)
		if got != c.want || ok != c.ok {
			t.Errorf("PriceRub(%q) = (%d, %v), want (%d, %v)", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestUnit(t *testing.T) {
	cases := map[string]string{
		"м":     "m",
		"/м":    "m",
		"шт":    "pcs",
		"/шт":   "pcs",
		"компл": "set",
		"кор":   "box",
	}
	for in, want := range cases {
		if got := Unit(in); got != want {
			t.Errorf("Unit(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCardPrice(t *testing.T) {
	price, unit, ok := CardPrice("Кабель силовой 175 \u20bd/м Есть в наличии В корзину")
	if !ok || price != 175 || unit != "m" {
		t.Errorf("CardPrice = (%d, %q, %v)", price, unit, ok)
	}
	if _, _, ok := CardPrice("без цены"); ok {
		t.Error("CardPrice should fail without price")
	}
}
