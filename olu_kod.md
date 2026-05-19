# Kullanılmayan / Ölü Kodlar Raporu

Bu dosya, kod tabanında tanımlı olan ancak halihazırda kullanılmayan bileşenleri, paketleri ve veritabanı tablolarını listelemektedir.

## 1. Kullanılmayan Veritabanı Modelleri (Prisma)
Aşağıdaki modeller `app/prisma/schema.prisma` dosyasında tanımlı olup, kaynak kodunda (`app/src/`) hiçbir yerde kullanılmamaktadır:
* **`IcTransaction`**: Grup içi işlemleri tutmak için tasarlanmış fakat kod tabanında atıl durumdadır.
* **`EliminationLog`**: Grup içi eliminasyon loglarını tutmak için tasarlanmış, `IcTransaction` ile birlikte atıl durumdadır.
* **`FinancialDataUpload`**: Finansal verilerin yükleme geçmişini tutmak üzere tasarlanmış fakat API'lerde veya backend servislerinde referansı yoktur.
* **`GroupElimination`**: Şema üzerinde doğrudan "Soft-deprecated — Faz 7.4.1-E'de migrate edilecek" notuyla bırakılmıştır. Yerini `GroupEliminationEntry` almış olup, yakında kaldırılabilir durumdadır.

## 2. Kullanılmayan NPM Paketleri
Aşağıdaki paketler `app/package.json` dosyasında bulunmasına rağmen kod içinde kullanılmamaktadır:
* **`@libsql/client`**: NeonDB ve Prisma'ya geçiş yapıldığı için artık aktif olarak kullanılmamaktadır. (Eski SQLite/Turso veritabanı döneminden kalmış olabilir).

## 3. Kullanılmayan Kod Parçaları ve Bileşenler (TypeScript)
Projede statik kod analiz aracına (`knip`) göre tanımlanıp (export edilip) hiçbir yerde çağrılmayan çok sayıda statik kod kalıntısı bulunmaktadır. Özellikle yeni `scenarioV3` modülü altında henüz tam olarak entegre edilmemiş / bağlanmamış arayüz (interface) ve tiplerden bazıları şunlardır:
* `ActionPlanRow`, `NotchPlan`, `AccountingImpactRow`, `UiReadyRow` (Decision Layer)
* `SeverityConsumption`, `PortfolioComposition`, `RatingTransition` (Rating Reasoning)
* `IncomeStatementBalances`, `EarningsQualitySnapshot`, `PortfolioSustainabilityLabel` (Sustainability Engine)
* `DataReliability`, `MetricDirectionality`, `ToleranceLevel` (Sector Intelligence)
