all: dist

js = *.js
png = *.png
version = $(shell jq -r '.version' < manifest.json)

dist: $(js) $(png) manifest.json
	mkdir -p dist
	cp manifest.json dist/
	cp *.js dist/
	cp *.png dist/
	ls dist > DIST_MANIFEST.temp
	diff -u DIST_MANIFEST DIST_MANIFEST.temp

transfix-mj-ext-$(version).zip: dist
	zip -j $@ dist/*

release: transfix-mj-ext-$(version).zip

watch:
	while true; do $(MAKE) -q || $(MAKE); sleep 0.5; done

clean:
	rm -f DIST_MANIFEST.temp
	rm -rf dist

.PHONY: build watch clean release
