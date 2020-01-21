import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ResultsComponent } from './results/results.component';
import { RecordComponent } from './record/record.component';

@NgModule({
  declarations: [
    AppComponent,
    ResultsComponent,
    RecordComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
