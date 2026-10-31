import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Comissoes } from './comissoes';

describe('Comissoes', () => {
  let component: Comissoes;
  let fixture: ComponentFixture<Comissoes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Comissoes],
    }).compileComponents();

    fixture = TestBed.createComponent(Comissoes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
