Certificados y claves FALSOS: solo para tests, sin relación con Apple ni con datos reales.
Todos los certificados son válidos desde 2025-01-01 00:00:00 UTC hasta 2045-01-01 00:00:00 UTC.
Generados con LibreSSL 3.3.6; los tests leen los PEM y nunca ejecutan OpenSSL.
Las claves de CA, CSR, configuración y base de datos se generaron en una carpeta temporal y se descartaron.
Claves: `openssl ecparam -name secp384r1 -genkey -noout -out NOMBRE-clave.pem` (hojas: `-name prime256v1`).
Solicitudes: `openssl req -new -key NOMBRE-clave.pem -subj '/CN=Fisquo Pruebas Raiz' -out NOMBRE.csr` (CN de intermedio y hoja: «Fisquo Pruebas Intermedio» y «Fisquo Pruebas Hoja»; otra raíz: «Fisquo Pruebas Otra Raiz»).
Raíz provisional: `openssl req -new -x509 -key raiz-clave.pem -subj '/CN=Fisquo Pruebas Raiz' -config ca.cnf -extensions raiz -out raiz-provisional.pem`.
Firmas: `openssl ca -batch -notext -config ca.cnf -keyfile EMISOR-clave.pem -cert EMISOR.pem -in NOMBRE.csr -out NOMBRE.pem -extensions SECCION -startdate 20250101000000Z -enddate 20450101000000Z`; raíz: añadir `-selfsign` y usar su certificado provisional.
`ca.cnf`: CA con `default_md=sha384`, `policy=politica`, `unique_subject=no`, índice vacío, serie inicial 1000 (hex); política `commonName=supplied`; CA con `basicConstraints=critical,CA:true,pathlen:1` (intermedio: 0), `keyUsage=critical,keyCertSign,cRLSign`; hojas con `CA:false` y `digitalSignature`; todas con `subjectKeyIdentifier=hash` y `authorityKeyIdentifier=keyid:always`.
Secciones Apple: `intermedio` añade `1.2.840.113635.100.6.2.1=DER:05:00`, `hoja` añade `1.2.840.113635.100.6.11.1=DER:05:00`; variantes sin OID omiten esa línea (intermedio reutiliza clave y CSR); la otra cadena usa claves independientes.
